// Alertas EWS (auto-resolución), filtro server-side, regresión de
// auto-resolución indebida y LEFT JOIN agent-scoped. Separado de
// alerts.test.ts (deuda de sizes-baseline, 2026-08-26) sólo por tamaño de
// archivo; fixture propia (cliente + agente + dispositivo) porque corre en
// su propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/alertsEwsRegression.test.ts

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
  deviceSerial: `SN-ALERTS-EWS-${ts}`, deviceId: '',
  ewsAlertId: 0,
};

describe('Alertas EWS/regresión — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Alerts EWS Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: 'Alerts EWS Test Agent' }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;
    ctx.agentKey = agent.data.key;

    const activated = await req('POST', '/agents/activate', { key: ctx.agentKey, hardwareId: `ALERTS-EWS-HW-${ts}` });
    assert.equal(activated.status, 200);
    ctx.agentToken = activated.data.token;

    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.211.10', mac: null, serial: ctx.deviceSerial, brand: 'hp', model: 'HP LaserJet Alerts EWS', name: 'Alerts EWS Test Device' }],
    }, ctx.agentToken);
    assert.equal(registered.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device, 'Dispositivo debe existir');
    ctx.deviceId = device.id;
  });
});

describe('Alertas EWS — auto-resolución cuando el equipo deja de reportarlas', () => {
  test('una alerta EWS se abre con código de vendor y se resuelve sola cuando el sync ya no la incluye', async () => {
    const opened = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.211.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 10, offline: false,
        supplies_details: { alerts: [{ code: 'C2-1411', description: 'Bandeja de salida llena', severity: 'WARNING' }] },
      }],
    }, ctx.agentToken);
    assert.equal(opened.status, 200);

    const withEwsAlert = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=C2-1411`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );
    assert.equal(withEwsAlert.data.length, 1);
    assert.equal(withEwsAlert.data[0].resolved, false);
    ctx.ewsAlertId = withEwsAlert.data[0].id;

    // El equipo deja de reportarla (supplies_details.alerts vacío, explícito) →
    // debe auto-resolverse. Antes de este trabajo, las alertas EWS NUNCA se
    // resolvían solas.
    const cleared = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.211.10', brand: 'hp',
        time: new Date(Date.now() + 1000).toISOString(), total_pages: 10, offline: false,
        supplies_details: { alerts: [] },
      }],
    }, ctx.agentToken);
    assert.equal(cleared.status, 200);

    const resolved = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=C2-1411`, undefined, ctx.adminToken),
      (r) => r.data[0]?.resolved === true,
    );
    assert.equal(resolved.data[0].resolved, true, 'La alerta EWS debe auto-resolverse cuando el equipo deja de reportarla');
  });

  test('la alerta EWS quedó clasificada: alert_class/alert_reason/origin=device', async () => {
    const { status, data } = await req('GET', `/alerts?device_id=${ctx.deviceId}&type=C2-1411`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data[0].origin, 'device');
    assert.equal(data[0].alert_class, 'subunit_out');
    assert.ok(data[0].alert_reason && data[0].alert_reason.length > 0);
  });
});

describe('Alertas — filtro server-side por alert_class y /alerts/summary', () => {
  test('GET /alerts?alert_class=subunit_out devuelve la alerta C2-1411 (server-side, no post-paginación)', async () => {
    const { status, data } = await req('GET', `/alerts?device_id=${ctx.deviceId}&alert_class=subunit_out`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.ok(data.length >= 1);
    assert.ok(data.every((a: any) => a.alert_class === 'subunit_out'));
  });

  test('alert_class inválido → 400', async () => {
    const { status } = await req('GET', '/alerts?alert_class=no-existe', undefined, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('responder inválido → 400', async () => {
    const { status } = await req('GET', '/alerts?responder=no-existe', undefined, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('GET /alerts/classes devuelve el catálogo completo (14 clases, 5 responders)', async () => {
    const { status, data } = await req('GET', '/alerts/classes', undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.classes.length, 14);
    assert.equal(data.responders.length, 5);
  });

  test('GET /alerts/summary cuadra con el conteo real de alertas activas del cliente', async () => {
    const [summary, list] = await Promise.all([
      req('GET', `/alerts/summary?client_id=${ctx.clientId}&resolved=false`, undefined, ctx.adminToken),
      req('GET', `/alerts?client_id=${ctx.clientId}&resolved=false&limit=200`, undefined, ctx.adminToken),
    ]);
    assert.equal(summary.status, 200);
    assert.equal(summary.data.total, list.data.length);
    const sumByClass = summary.data.byClass.reduce((acc: number, r: any) => acc + r.count, 0);
    assert.equal(sumByClass, list.data.length);
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
    assert.equal(found.client_name, `Alerts EWS Test Client ${ts}`);
    assert.equal(found.agent_name, 'Alerts EWS Test Agent');
    assert.equal(found.device_id, null);

    const resolvedFalse = await req('GET', '/alerts?resolved=false&type=agent_offline', undefined, ctx.adminToken);
    assert.ok(resolvedFalse.data.some((a: any) => a.id === syntheticId));

    await rawDb('alerts').where({ id: syntheticId }).delete();
  });
});
