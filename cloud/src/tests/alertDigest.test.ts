// Digest diario de alertas (Fase 1 del gap analysis vs HP SDS, "⬜ digest diario
// no implementado" cerrado 25/08/2026) — unitarios directos contra Postgres real
// (mismo criterio de conexión que alerts.test.ts/incidents.test.ts:
// ALERTS_TEST_DB_PORT). No hay endpoint HTTP para esto (es un job `setInterval`
// puro, ver alertDigestJob.ts), así que NO pega la API — no necesita el server
// corriendo, sólo Postgres.
// Ejecutar: npx tsx --test src/tests/alertDigest.test.ts

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib from 'knex';

const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.ALERTS_TEST_DB_HOST || 'localhost',
    port: Number(process.env.ALERTS_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});

// El job hace un tick inmediato + `setInterval` al importarse (mismo criterio
// que heartbeatMonitor.ts/retentionJob.ts) — sin este guard, importarlo acá
// dispararía un tick real contra esta base ANTES de que existan los fixtures,
// y dejaría un `setInterval` colgado que nunca deja terminar a `node --test`.
// Ver el guard `ALERT_DIGEST_JOB_AUTOSTART` en alertDigestJob.ts (sólo lo usa
// este test; `server.ts` nunca lo setea, comportamiento en prod intacto).
// Statement plano (no `import` estático) para que corra ANTES del `import()`
// dinámico de abajo — un `import` estático se hoistea por encima de esto.
process.env.ALERT_DIGEST_JOB_AUTOSTART = '0';

/* eslint-disable @typescript-eslint/no-explicit-any */
let jobFns: typeof import('../jobs/alertDigestJob');

before(async () => {
  jobFns = await import('../jobs/alertDigestJob');
});

after(async () => {
  // Cascada: clients → agents (ON DELETE CASCADE) → alerts (ON DELETE CASCADE).
  await rawDb('clients').where('name', 'like', `Digest Test Client ${ts}%`).del();
  await rawDb.destroy().catch(() => {});
  // El job abre su PROPIO pool de knex a nivel de módulo (`db` en
  // alertDigestJob.ts) — sin cerrarlo acá, el proceso de `node --test` nunca
  // drena el event loop y queda colgado indefinidamente después de terminar
  // los tests (encontrado corriendo la suite completa: el runner nunca
  // avanzaba al siguiente archivo).
  await jobFns.closeDb().catch(() => {});
});

const ts = Date.now();
let seq = 0;

async function createClient(opts: {
  events?: string[];
  email?: string | null;
  lastSentAt?: Date | null;
} = {}): Promise<string> {
  seq += 1;
  const [{ id }] = await rawDb('clients')
    .insert({ name: `Digest Test Client ${ts}-${seq}` })
    .returning('id');
  await rawDb('clients')
    .where('id', id)
    .update({
      notification_events: JSON.stringify(opts.events ?? ['alert.digest']),
      notification_email: opts.email === undefined ? `digest-${id}@test.local` : opts.email,
      last_alert_digest_sent_at: opts.lastSentAt ?? null,
    });
  return id as string;
}

async function createAgentFor(clientId: string): Promise<string> {
  const [{ id }] = await rawDb('agents')
    .insert({ client_id: clientId, name: 'Digest Test Agent' })
    .returning('id');
  return id as string;
}

let alertSeq = 0;

async function insertAlert(
  agentId: string,
  opts: {
    severity: 'critical' | 'warning';
    resolved?: boolean;
    createdAt?: Date;
    alertClass?: string | null;
  }
): Promise<void> {
  alertSeq += 1;
  // `type` único por llamada: `alerts_agent_type_open_uniq` es un índice único
  // parcial sobre (agent_id, type) WHERE resolved=false — dos alertas abiertas
  // del mismo agente con el mismo `type` violarían la constraint (real: las
  // alertas reales siempre difieren por tipo, toner_black_low/device_offline/etc.).
  await rawDb('alerts').insert({
    agent_id: agentId,
    type: `digest_test_alert_${alertSeq}`,
    severity: opts.severity,
    message: 'fixture de test',
    resolved: opts.resolved ?? false,
    resolved_at: opts.resolved ? rawDb.fn.now() : null,
    created_at: opts.createdAt ?? rawDb.fn.now(),
    alert_class: opts.alertClass ?? null,
  });
}

/** Hora local actual en TZ Buenos Aires — misma conversión que `findEligibleClients`.
 * El gate de horario del job depende de `now()` real (no es inyectable), así que
 * las aserciones de elegibilidad se comparan contra esto en vez de asumir un
 * valor fijo — evita un test flaky según la hora en que corra la suite. */
async function currentLocalHour(): Promise<number> {
  const r = await rawDb.raw(
    `SELECT EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int AS h`
  );
  return Number(r.rows[0].h);
}

describe('findEligibleClients — opt-in, email, y gate de horario/idempotencia', () => {
  test('sin "alert.digest" en notification_events → afuera aunque tenga email', async () => {
    const clientId = await createClient({ events: ['alert.created'] });
    const eligible = await jobFns.findEligibleClients();
    assert.ok(!eligible.some((c) => c.id === clientId));
  });

  test('sin notification_email → afuera aunque esté opt-in', async () => {
    const clientId = await createClient({ events: ['alert.digest'], email: null });
    const eligible = await jobFns.findEligibleClients();
    assert.ok(!eligible.some((c) => c.id === clientId));
  });

  test('ya recibió el digest HOY → afuera (idempotencia), sin importar la hora', async () => {
    const clientId = await createClient({ events: ['alert.digest'], lastSentAt: new Date() });
    const eligible = await jobFns.findEligibleClients();
    assert.ok(!eligible.some((c) => c.id === clientId));
  });

  test('opt-in + email + sin envío previo → elegible sólo si ya pasó la hora de corte local (07:00)', async () => {
    const hour = await currentLocalHour();
    const clientId = await createClient({ events: ['alert.digest'] });
    const eligible = await jobFns.findEligibleClients();
    const included = eligible.some((c) => c.id === clientId);
    assert.equal(included, hour >= 7, `hora local actual=${hour}`);
  });

  test('recibió el digest hace >24h (día local anterior) → vuelve a ser elegible (si ya pasó la hora de corte)', async () => {
    const hour = await currentLocalHour();
    // 26h de margen: garantiza cruzar al menos una medianoche local sin
    // ambigüedad, sea cual sea la hora real en que corra este test.
    const overOneDayAgo = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const clientId = await createClient({ events: ['alert.digest'], lastSentAt: overOneDayAgo });
    const eligible = await jobFns.findEligibleClients();
    const included = eligible.some((c) => c.id === clientId);
    assert.equal(included, hour >= 7, `hora local actual=${hour}`);
  });
});

describe('gatherDigestStats — conteo por severidad + top de clases en 24h', () => {
  test('cuenta abiertas por severidad (ignora resueltas y antigüedad) y arma el top de clases SOLO de las últimas 24h', async () => {
    const clientId = await createClient();
    const agentId = await createAgentFor(clientId);
    const oldDate = new Date(Date.now() - 40 * 60 * 60 * 1000); // fuera de la ventana de 24h

    // Abiertas, antiguas (para no interferir con el conteo de clases en 24h):
    // 2 críticas + 3 advertencias deben contarse en criticalCount/warningCount.
    await insertAlert(agentId, { severity: 'critical', createdAt: oldDate });
    await insertAlert(agentId, { severity: 'critical', createdAt: oldDate });
    await insertAlert(agentId, { severity: 'warning', createdAt: oldDate });
    await insertAlert(agentId, { severity: 'warning', createdAt: oldDate });
    await insertAlert(agentId, { severity: 'warning', createdAt: oldDate });
    // Resuelta y antigua: NO debe sumar a criticalCount aunque sea crítica.
    await insertAlert(agentId, { severity: 'critical', resolved: true, createdAt: oldDate });

    // Últimas 24h, resueltas a propósito (para NO tocar warningCount, que sólo
    // mira `resolved=false`) — sólo deben impactar opened24h/topClasses.
    for (let i = 0; i < 3; i++) {
      await insertAlert(agentId, { severity: 'warning', resolved: true, alertClass: 'consumable_low' });
    }
    for (let i = 0; i < 2; i++) {
      await insertAlert(agentId, { severity: 'warning', resolved: true, alertClass: 'jam' });
    }

    const stats = await jobFns.gatherDigestStats(clientId);
    assert.equal(stats.criticalCount, 2, 'sólo las 2 críticas abiertas (la resuelta no cuenta)');
    assert.equal(stats.warningCount, 3, 'sólo las 3 advertencias abiertas (las de 24h están resueltas)');
    assert.equal(stats.opened24h, 5, 'las 3+2 de las últimas 24h, ignorando las 6 de hace 40h');
    assert.ok(
      stats.topClasses.startsWith('Nivel bajo del consumible (3)'),
      `top de clases debe empezar por la más frecuente: ${stats.topClasses}`
    );
    assert.ok(stats.topClasses.includes('Atasco (2)'), stats.topClasses);
  });

  test('sin alertas en las últimas 24h → topClasses "ninguna" y opened24h 0', async () => {
    const clientId = await createClient();
    const agentId = await createAgentFor(clientId);
    await insertAlert(agentId, {
      severity: 'critical',
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    const stats = await jobFns.gatherDigestStats(clientId);
    assert.equal(stats.opened24h, 0);
    assert.equal(stats.topClasses, 'ninguna');
    assert.equal(stats.criticalCount, 1, 'la crítica abierta de hace 48h sigue contando (no depende de la ventana)');
  });
});

describe('runDigestCheck — el fallo de un cliente no bloquea a los demás', () => {
  test('un cliente que revienta al enviar no impide el envío/marca de los otros elegibles', async () => {
    const hour = await currentLocalHour();
    if (hour < 7) {
      // El gate de horario es real (no inyectable): fuera de la ventana
      // 07:00+ local ningún cliente es elegible y este test no tendría nada
      // que verificar — se salta explícitamente en vez de fallar en falso.
      console.log(`  (salteado: hora local ${hour} < 7, fuera de ventana del digest)`);
      return;
    }

    const clientOk = await createClient();
    const clientFail = await createClient();
    await createAgentFor(clientOk);
    await createAgentFor(clientFail);

    const rowOkBefore = await rawDb('clients').where('id', clientOk).first('notification_email');
    const rowFailBefore = await rawDb('clients').where('id', clientFail).first('notification_email');
    const failEmail = rowFailBefore.notification_email as string;
    const okEmail = rowOkBefore.notification_email as string;

    // `sendMail` real de `notificationService` es un named export ESM (binding
    // en vivo, no configurable) — `mock.method`/`Object.defineProperty` no
    // pueden parchearlo desde afuera (confirmado: tira "must be a method,
    // received undefined", porque la propiedad es un accessor, no un valor).
    // `runDigestCheck` acepta `sendMailFn` inyectable justo para esto.
    const calls: string[] = [];
    const stubSendMail = async (opts: { to?: string }) => {
      calls.push(opts.to ?? '');
      if (opts.to === failEmail) throw new Error('boom simulado (cliente que falla)');
    };

    await jobFns.runDigestCheck(stubSendMail);

    assert.ok(calls.includes(okEmail), 'el cliente sano debe haber intentado su envío');
    assert.ok(calls.includes(failEmail), 'el cliente que falla también debe haberse intentado');

    const rowOkAfter = await rawDb('clients').where('id', clientOk).first('last_alert_digest_sent_at');
    const rowFailAfter = await rawDb('clients').where('id', clientFail).first('last_alert_digest_sent_at');
    assert.ok(rowOkAfter.last_alert_digest_sent_at, 'al cliente sano se le debe marcar el envío de hoy');
    assert.equal(
      rowFailAfter.last_alert_digest_sent_at,
      null,
      'al cliente que falló NO se le debe marcar — debe poder reintentar en el próximo tick'
    );
  });
});
