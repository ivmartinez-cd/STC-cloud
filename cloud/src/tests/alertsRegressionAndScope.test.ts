// Regresión de auto-resolución indebida (device_still_reporting) y LEFT JOIN
// agent-scoped de getAlerts. Separado de alertsEwsRegression.test.ts (deuda de
// sizes-baseline, 26/08/2026, al sumar los tests de /alerts/summary#byCode y
// /alerts/count del handoff hifi #3) — mismo criterio de la división original:
// sólo tamaño de archivo, fixture propia porque corre en su propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/alertsRegressionAndScope.test.ts

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

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

/** Reintenta `fn` hasta que `predicate(result)` sea true, o se agote el tiempo. */
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

// Conexión directa a Postgres SOLO para insertar una alerta agent-scoped sintética
// (no hay generador real de `agent_offline` todavía) y así probar el LEFT JOIN de
// `getAlerts` sin depender de esa fase — mismo criterio que alerts.test.ts.
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
  clientId: '', agentId: '', agentKey: '', agentToken: '',
};

describe('Alertas regresión/scope — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Alerts Regression Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: 'Alerts Regression Test Agent' }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;
    ctx.agentKey = agent.data.key;

    const activated = await req('POST', '/agents/activate', { key: ctx.agentKey, hardwareId: `ALERTS-REGRESSION-HW-${ts}` });
    assert.equal(activated.status, 200);
    ctx.agentToken = activated.data.token;
  });
});

describe('Alertas — bug de auto-resolución indebida (device_still_reporting no debe cerrarse por un sync EWS de otro tipo)', () => {
  const regressionSerial = `SN-ALERTS-REGRESSION-${ts}`;
  const regressionCtx = { deviceId: '' };

  test('crear un segundo equipo y darlo de baja', async () => {
    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: regressionSerial, ip: '192.168.211.20', brand: 'hp',
        time: new Date().toISOString(), total_pages: 5, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const found = await pollUntil(
      () => req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken),
      (r) => r.data.some((d: any) => d.serial_number === regressionSerial),
    );
    regressionCtx.deviceId = found.data.find((d: any) => d.serial_number === regressionSerial).id;

    const decomm = await req('POST', `/devices/${regressionCtx.deviceId}/decommission`, { reason: 'Prueba de regresión' }, ctx.adminToken);
    assert.equal(decomm.status, 200);
  });

  test('un sync tras la baja abre device_still_reporting con origin=cloud, y una alerta EWS aparte con origin=device', async () => {
    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: regressionSerial, ip: '192.168.211.20', brand: 'hp',
        time: new Date(Date.now() + 1000).toISOString(), total_pages: 6, offline: false,
        supplies_details: { alerts: [{ code: 'HR-0', description: 'Low paper', severity: 'WARNING' }] },
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const stillReporting = await pollUntil(
      () => req('GET', `/alerts?device_id=${regressionCtx.deviceId}&type=device_still_reporting`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );
    assert.equal(stillReporting.data[0].resolved, false);
    assert.equal(stillReporting.data[0].origin, 'cloud');

    const ewsAlert = await req('GET', `/alerts?device_id=${regressionCtx.deviceId}&type=HR-0`, undefined, ctx.adminToken);
    assert.equal(ewsAlert.data[0].origin, 'device');
  });

  test('un sync posterior con una lista EWS DISTINTA no cierra device_still_reporting (bug real, pre-fix), pero sí resuelve la alerta EWS vieja', async () => {
    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: regressionSerial, ip: '192.168.211.20', brand: 'hp',
        time: new Date(Date.now() + 2000).toISOString(), total_pages: 7, offline: false,
        supplies_details: { alerts: [{ code: 'HR-1', description: 'No paper', severity: 'WARNING' }] },
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const oldEwsResolved = await pollUntil(
      () => req('GET', `/alerts?device_id=${regressionCtx.deviceId}&type=HR-0`, undefined, ctx.adminToken),
      (r) => r.data[0]?.resolved === true,
    );
    assert.equal(oldEwsResolved.data[0].resolved, true, 'la alerta EWS vieja (HR-0, origin=device) sí debe auto-resolverse');

    const stillReporting = await req('GET', `/alerts?device_id=${regressionCtx.deviceId}&type=device_still_reporting`, undefined, ctx.adminToken);
    assert.equal(
      stillReporting.data[0].resolved, false,
      'device_still_reporting (origin=cloud) NO debe auto-resolverse por un sync EWS de otro tipo — este era el bug real'
    );
  });
});

describe('Alertas agent-scoped — LEFT JOIN de getAlerts', () => {
  test('una alerta con agent_id (sin device_id) resuelve client_name/agent_name y respeta el filtro resolved', async () => {
    // No hay generador real de `agent_offline` todavía (Fase 2) — se inserta
    // directo para probar el join sin esperar esa fase.
    const [{ id: syntheticId }] = await rawDb('alerts').insert({
      agent_id: ctx.agentId,
      type: 'agent_offline',
      severity: 'critical',
      message: 'Monitor sin señal (prueba)',
      resolved: false,
    }).returning('id');

    const { status, data } = await req('GET', `/alerts?type=agent_offline`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    const found = data.find((a: any) => a.id === syntheticId);
    assert.ok(found, 'La alerta agent-scoped debe aparecer (antes era invisible: join sobre devices era INNER)');
    assert.equal(found.client_name, `Alerts Regression Test Client ${ts}`);
    assert.equal(found.agent_name, 'Alerts Regression Test Agent');
    assert.equal(found.device_id, null);

    const resolvedFalse = await req('GET', '/alerts?resolved=false&type=agent_offline', undefined, ctx.adminToken);
    assert.ok(resolvedFalse.data.some((a: any) => a.id === syntheticId));

    await rawDb('alerts').where({ id: syntheticId }).delete();
  });
});
