// Alertas EWS (auto-resolución), filtro server-side, /alerts/summary
// (byClass/byCode/clients_affected) y /alerts?max_age_hours=. Separado de
// alerts.test.ts (deuda de sizes-baseline, 2026-08-26) sólo por tamaño de
// archivo; fixture propia (cliente + agente + dispositivo) porque corre en
// su propio proceso. La regresión de auto-resolución indebida y el LEFT JOIN
// agent-scoped viven en alertsRegressionAndScope.test.ts (mismo motivo,
// 26/08/2026, al sumar los tests del handoff hifi #3).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/alertsEwsRegression.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
  // El describe anterior resuelve la alerta C2-1411 A PROPÓSITO (es la prueba
  // de auto-resolución) — sin reabrirla acá, "byCode cuadra..." de abajo
  // filtra `resolved=false` y nunca la encuentra: `subunitOut` da `undefined`
  // (bug real encontrado corriendo la suite completa, 26/08/2026 — la
  // aserción asumía "seteada en el describe anterior" sin contar con que
  // ese mismo describe la deja resuelta al terminar).
  test('setup: reabrir la alerta EWS subunit_out (el describe anterior la resolvió a propósito)', async () => {
    const reopened = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.211.10', brand: 'hp',
        time: new Date(Date.now() + 2000).toISOString(), total_pages: 10, offline: false,
        supplies_details: { alerts: [{ code: 'C2-1411', description: 'Bandeja de salida llena', severity: 'WARNING' }] },
      }],
    }, ctx.agentToken);
    assert.equal(reopened.status, 200);
    const open = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=C2-1411`, undefined, ctx.adminToken),
      (r) => r.data[0]?.resolved === false,
    );
    assert.equal(open.data[0]?.resolved, false, 'debe volver a quedar abierta para los tests de este describe');
  });

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

  test('GET /alerts/summary — byCode cuadra con el total y distingue device_offline de agent_offline', async () => {
    const { status, data } = await req('GET', `/alerts/summary?client_id=${ctx.clientId}&resolved=false`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    const sumByCode = data.byCode.reduce((acc: number, r: any) => acc + r.count, 0);
    assert.equal(sumByCode, data.total);
    // `subunit_out` (C2-1411, seteado en el describe anterior) no es `availability`
    // → su código de diagnóstico es el nombre de la clase, no un `type` crudo.
    const subunitOut = data.byCode.find((r: any) => r.code === 'subunit_out');
    assert.ok(subunitOut && subunitOut.count >= 1);
    assert.ok(data.byCode.every((r: any) => r.code !== 'availability'), 'availability nunca debe aparecer como código — se desagrega en device_offline/agent_offline');
    assert.ok(typeof data.clients_affected === 'number' && data.clients_affected >= 1);
  });

  test('GET /alerts?max_age_hours=24 incluye la alerta recién creada; max_age_hours=0 (inválido) no filtra', async () => {
    const recent = await req('GET', `/alerts?device_id=${ctx.deviceId}&max_age_hours=24`, undefined, ctx.adminToken);
    assert.equal(recent.status, 200);
    assert.ok(recent.data.length >= 1);
    const noFilter = await req('GET', `/alerts?device_id=${ctx.deviceId}&max_age_hours=0`, undefined, ctx.adminToken);
    assert.equal(noFilter.data.length, (await req('GET', `/alerts?device_id=${ctx.deviceId}`, undefined, ctx.adminToken)).data.length);
  });

  test('GET /alerts?q= busca por código, cliente y equipo; /alerts/count cuadra con la longitud de la página', async () => {
    const byCode = await req('GET', `/alerts?device_id=${ctx.deviceId}&q=C2-1411`, undefined, ctx.adminToken);
    assert.ok(byCode.data.length >= 1);
    const byDevice = await req('GET', `/alerts?device_id=${ctx.deviceId}&q=${encodeURIComponent('Alerts EWS Test Device')}`, undefined, ctx.adminToken);
    assert.ok(byDevice.data.length >= 1);
    const countRes = await req('GET', `/alerts/count?device_id=${ctx.deviceId}&q=C2-1411`, undefined, ctx.adminToken);
    assert.equal(countRes.status, 200);
    assert.equal(countRes.data.total, byCode.data.length);
  });
});
