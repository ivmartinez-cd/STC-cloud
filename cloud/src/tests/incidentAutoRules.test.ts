// Reglas de auto-creación de incidentes (Fase 11 del gap analysis vs HP SDS).
// Separado de incidents.test.ts (deuda de sizes-baseline, 2026-08-26) sólo por
// tamaño de archivo; fixture propia porque corre en su propio proceso — las 2
// describes originales quedan juntas tal cual porque la segunda reusa la
// alerta abierta por la primera (mismo equipo, misma clase `consumable_out`).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/incidentAutoRules.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knexLib from 'knex';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

async function req(method: string, path: string, body: unknown = {}, token?: string) {
  const isBodyless = method === 'GET' || method === 'HEAD';
  const headers: Record<string, string> = {};
  if (!isBodyless) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: isBodyless ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 8000, stepMs = 300): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, stepMs));
  } while (Date.now() < deadline);
  return last;
}

function sync(agentToken: string, serial: string, ip: string, extra: Record<string, unknown> = {}) {
  return req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: serial, ip, brand: 'hp',
      time: new Date().toISOString(), total_pages: 10, offline: false,
      ...extra,
    }],
  }, agentToken);
}

// Conexión directa a Postgres SOLO para simular un segundo incidente `auto`
// abierto sin depender de otro ciclo real del worker (~2 min) — mismo
// criterio que incidents.test.ts/alerts.test.ts.
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

after(async () => {
  await rawDb.destroy().catch(() => {});
});

const ts = Date.now();
const ctx = {
  adminToken: '',
  clientId: '', agentId: '', agentToken: '',
  deviceId: '', deviceSerial: `SN-INCIDENTS-AUTO-${ts}`,
};

describe('Reglas de auto-creación — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Incidents Auto Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Incidents Auto ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-INCIDENTS-AUTO-${ts}` });
    ctx.agentToken = activate.data.token;

    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.245.10', { toner_black: 80 });
    assert.equal(s.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    ctx.deviceId = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial).id;
  });
});

describe('Garantía de compatibilidad — reglas opt-in', () => {
  test('con las reglas globales en enabled=false, una alerta crítica NO genera ningún incidente automático', async () => {
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.245.10', { toner_yellow: 3 });
    assert.equal(s.status, 200);
    // No hace falta esperar un tick del worker: sin ninguna fila `enabled=true`
    // para esta clase (ni global ni de este cliente), el worker JAMÁS puede
    // producir un incidente para esta alerta — se verifica de una, no
    // "todavía no pasó".
    await new Promise((r) => setTimeout(r, 500));
    const autoIncidents = await req('GET', `/incidents?client_id=${ctx.clientId}&class=consumable_out`, undefined, ctx.adminToken);
    assert.equal(autoIncidents.data.items.filter((i: any) => i.origin === 'auto').length, 0);
  });
});

describe('Reglas de auto-creación — habilitadas por cliente', () => {
  let autoIncidentId = '';

  test('GET /clients/:id/incident-rules trae las 8 clases globales', async () => {
    const res = await req('GET', `/clients/${ctx.clientId}/incident-rules`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.length >= 8);
    assert.ok(res.data.every((r: any) => r.enabled === false));
  });

  test('habilitar la regla consumable_out para este cliente (delay_minutes:0) → el worker agrupa las alertas críticas de tóner en UN incidente automático', async (t) => {
    // Segunda alerta abierta de la MISMA clase (`consumable_out`) en el MISMO
    // equipo — `toner_yellow_critical` (de la prueba de compatibilidad de
    // arriba) sigue abierta.
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.245.10', { toner_magenta: 4 });
    assert.equal(s.status, 200);
    await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=toner_magenta_critical&resolved=false`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );

    const put = await req('PUT', `/clients/${ctx.clientId}/incident-rules`, {
      rules: [{ class: 'consumable_out', enabled: true, delay_minutes: 0 }],
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.ok(put.data[0].enabled);

    // El worker corre cada 2 min (mismo criterio que heartbeatMonitor/
    // retentionJob, ver incidentWorker.ts) — sin atajo de test para acortar
    // el intervalo en un job de producción, así que este test espera un
    // ciclo real. `toner_yellow_critical` y `toner_magenta_critical` son dos
    // alertas DISTINTAS de la MISMA clase `consumable_out` en el MISMO
    // equipo — deben terminar agrupadas en un solo incidente automático.
    t.diagnostic('Esperando hasta 3 min a que corra el tick del incidentWorker (cadencia real de 2 min)...');
    const found = await pollUntil(
      () => req('GET', `/incidents?client_id=${ctx.clientId}&class=consumable_out`, undefined, ctx.adminToken),
      (r) => r.data.items.some((i: any) => i.origin === 'auto'),
      180_000, 5_000,
    );
    const autoIncidents = found.data.items.filter((i: any) => i.origin === 'auto');
    assert.equal(autoIncidents.length, 1, 'las 2 alertas de la misma clase/equipo deben agruparse en UN solo incidente');

    const detail = await req('GET', `/incidents/${autoIncidents[0].id}`, undefined, ctx.adminToken);
    const linkedTypes = detail.data.alerts.map((a: any) => a.type);
    assert.ok(linkedTypes.includes('toner_yellow_critical'));
    assert.ok(linkedTypes.includes('toner_magenta_critical'));
    // `rule_id` (handoff hifi #3, fase 4, 26/08/2026): el worker lo completa
    // desde acá en adelante — la regla que se acaba de habilitar es la que
    // abrió el incidente.
    assert.equal(detail.data.rule_id, put.data[0].id);

    autoIncidentId = autoIncidents[0].id;
  });

  test('reapertura con colisión contra otro incidente automático abierto del mismo (equipo, clase) → 409', async () => {
    assert.ok(autoIncidentId);

    const closed = await req('POST', `/incidents/${autoIncidentId}/close`, {}, ctx.adminToken);
    assert.equal(closed.data.status, 'closed');

    // Simula que, mientras estaba cerrado, el worker abrió uno NUEVO para el
    // mismo (device_id, class) — exactamente la situación que
    // `incidents_open_device_class_uniq` está para evitar en un INSERT/reopen directo.
    const [second] = await rawDb('incidents').insert({
      client_id: ctx.clientId, device_id: ctx.deviceId, class: 'consumable_out',
      title: 'Incidente automático simulado', severity: 'critical', origin: 'auto',
    }).returning('id');

    const reopen = await req('POST', `/incidents/${autoIncidentId}/reopen`, {}, ctx.adminToken);
    assert.equal(reopen.status, 409);
    assert.equal(reopen.data.conflictId, second.id);
  });
});
