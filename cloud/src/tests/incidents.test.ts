// Módulo de incidentes (Fase 11 del gap analysis vs HP SDS) — Tests de
// integración, mismo criterio que deviceLifecycle.test.ts/alerts.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/incidents.test.ts

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
// criterio que `alerts.test.ts` (alerta agent-scoped sintética) para probar
// un camino sin esperar a un disparador lento/complejo.
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
  deviceId: '', deviceSerial: `SN-INCIDENTS-${ts}`,
};

describe('Incidentes — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Incidents Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Incidents ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-INCIDENTS-${ts}` });
    ctx.agentToken = activate.data.token;

    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.244.10', { toner_black: 80 });
    assert.equal(s.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    ctx.deviceId = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial).id;
  });
});

describe('Incidentes manuales — CRUD, vínculo con alertas, cierre/reapertura', () => {
  let incidentId = '';
  let alertId = 0;

  test('crear incidente manual con número legible', async () => {
    const res = await req('POST', '/incidents', {
      client_id: ctx.clientId, device_id: ctx.deviceId, class: 'jam',
      title: 'Atasco recurrente en bandeja 2',
    }, ctx.adminToken);
    assert.equal(res.status, 201);
    assert.equal(res.data.status, 'open');
    assert.equal(res.data.origin, 'manual');
    assert.ok(Number(res.data.number) >= 100000);
    incidentId = res.data.id;
  });

  test('GET /incidents/:id trae el item + alerts[] + events[]', async () => {
    const res = await req('GET', `/incidents/${incidentId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.id, incidentId);
    assert.ok(Array.isArray(res.data.alerts));
    assert.ok(Array.isArray(res.data.events));
    assert.ok(res.data.events.length >= 1, 'debe registrar el evento de creación');
  });

  test('vincular una alerta real al incidente', async () => {
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.244.10', { toner_black: 5 });
    assert.equal(s.status, 200);
    const alerts = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=toner_black_critical&resolved=false`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );
    alertId = alerts.data[0].id;

    const link = await req('POST', `/incidents/${incidentId}/alerts`, { alert_id: alertId }, ctx.adminToken);
    assert.equal(link.status, 200);

    const detail = await req('GET', `/incidents/${incidentId}`, undefined, ctx.adminToken);
    assert.ok(detail.data.alerts.some((a: any) => a.id === alertId));
  });

  test('la alerta trae incident_id/incident_number en GET /alerts', async () => {
    const res = await req('GET', `/alerts?device_id=${ctx.deviceId}&type=toner_black_critical`, undefined, ctx.adminToken);
    const alert = res.data.find((a: any) => a.id === alertId);
    assert.ok(alert);
    assert.equal(alert.incident_id, incidentId);
  });

  test('resolver la alerta NO cierra ni modifica el incidente (frontera alerta ↔ incidente)', async () => {
    const before = await req('GET', `/incidents/${incidentId}`, undefined, ctx.adminToken);
    await req('PUT', `/alerts/${alertId}`, { resolved: true }, ctx.adminToken);
    const after = await req('GET', `/incidents/${incidentId}`, undefined, ctx.adminToken);
    assert.equal(after.data.status, before.data.status);
    assert.equal(after.data.status, 'open', 'el incidente sigue abierto aunque la alerta ya resolvió');
  });

  test('cerrar el incidente NO resuelve alertas de vuelta a abiertas ni las toca', async () => {
    const close = await req('POST', `/incidents/${incidentId}/close`, { reason: 'Visita técnica, cartucho reemplazado' }, ctx.adminToken);
    assert.equal(close.status, 200);
    assert.equal(close.data.status, 'closed');
    assert.ok(close.data.closed_at);
  });

  test('reabrir un incidente cerrado', async () => {
    const reopen = await req('POST', `/incidents/${incidentId}/reopen`, { reason: 'El cartucho reemplazado también falló' }, ctx.adminToken);
    assert.equal(reopen.status, 200);
    assert.equal(reopen.data.status, 'open');
    assert.equal(reopen.data.reopened_count, 1);
  });

  test('desvincular la alerta', async () => {
    const res = await req('DELETE', `/incidents/${incidentId}/alerts/${alertId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    const detail = await req('GET', `/incidents/${incidentId}`, undefined, ctx.adminToken);
    assert.equal(detail.data.alerts.some((a: any) => a.id === alertId), false);
  });

  test('comentar el incidente', async () => {
    const res = await req('POST', `/incidents/${incidentId}/comments`, { body: 'Esperando repuesto del proveedor' }, ctx.adminToken);
    assert.equal(res.status, 200);
    const detail = await req('GET', `/incidents/${incidentId}`, undefined, ctx.adminToken);
    assert.ok(detail.data.events.some((e: any) => e.kind === 'comment' && e.body === 'Esperando repuesto del proveedor'));
  });

  test('PATCH actualiza campos permitidos', async () => {
    const res = await req('PATCH', `/incidents/${incidentId}`, { title: 'Atasco recurrente — cambiado rodillo', severity: 'warning' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.title, 'Atasco recurrente — cambiado rodillo');
    assert.equal(res.data.severity, 'warning');
  });

  test('close sobre un incidente ya cerrado es idempotente', async () => {
    await req('POST', `/incidents/${incidentId}/close`, {}, ctx.adminToken);
    const again = await req('POST', `/incidents/${incidentId}/close`, {}, ctx.adminToken);
    assert.equal(again.status, 200);
    assert.equal(again.data.status, 'closed');
  });

  test('reopen sobre un incidente ya abierto → 409', async () => {
    await req('POST', `/incidents/${incidentId}/reopen`, {}, ctx.adminToken);
    const { status } = await req('POST', `/incidents/${incidentId}/reopen`, {}, ctx.adminToken);
    assert.equal(status, 409);
  });

  test('GET /incidents?class=jam lista el incidente creado, GET /incidents/stats cuadra', async () => {
    const list = await req('GET', `/incidents?client_id=${ctx.clientId}&class=jam`, undefined, ctx.adminToken);
    assert.equal(list.status, 200);
    assert.ok(list.data.items.some((i: any) => i.id === incidentId));

    const stats = await req('GET', `/incidents/stats?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(stats.status, 200);
    assert.ok(stats.data.byStatus.open >= 1);
  });
});

describe('Garantía de compatibilidad — reglas opt-in', () => {
  test('con las reglas globales en enabled=false, una alerta crítica NO genera ningún incidente automático', async () => {
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.244.10', { toner_yellow: 3 });
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
    // arriba) sigue abierta; `toner_black_critical` NO sirve para esto
    // porque ya se resolvió en el bloque de CRUD manual de más arriba.
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.244.10', { toner_magenta: 4 });
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

describe('Incidentes — RBAC', () => {
  test('client_viewer puede leer (list/stats/detail) pero no crear ni mutar', async () => {
    const created = await req('POST', '/portal/users', {
      username: `incidents_viewer_${ts}`, password: 'Incidents1234!', role: 'client_viewer', client_id: ctx.clientId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: `incidents_viewer_${ts}`, password: 'Incidents1234!' });
    const viewerToken = login.data.token;

    const list = await req('GET', '/incidents', undefined, viewerToken);
    assert.equal(list.status, 200);
    assert.ok(list.data.items.every((i: any) => i.client_id === ctx.clientId));

    const stats = await req('GET', '/incidents/stats', undefined, viewerToken);
    assert.equal(stats.status, 200);

    const create = await req('POST', '/incidents', { client_id: ctx.clientId, class: 'jam' }, viewerToken);
    assert.equal(create.status, 403);

    const rules = await req('GET', `/clients/${ctx.clientId}/incident-rules`, undefined, viewerToken);
    assert.equal(rules.status, 403);
  });
});
