// Alertas: ciclo de vida (ack/resolve) + dedupe — Tests de integración, mismo
// criterio que e2e.test.ts/rbac.test.ts (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/alerts.test.ts
//
// El worker de tóner (`alertWorker.ts`) corre asíncrono vía BullMQ — el sync HTTP
// devuelve 200 antes de que la alerta exista. `pollUntil` reintenta unos segundos
// en vez de asumir que ya está lista apenas responde `/devices/sync`.

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
  adminToken: '', adminUserId: '',
  clientId: '', agentId: '', agentKey: '', agentToken: '',
  deviceSerial: `SN-ALERTS-${ts}`, deviceId: '',
  tonerAlertId: 0,
  counterResetAlertId: 0,
};

describe('Alertas — fixtures', () => {
  test('Setup: login admin', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(status, 200);
    ctx.adminToken = data.token;
  });

  test('Setup: /portal/me', async () => {
    const { status, data } = await req('GET', '/portal/me', undefined, ctx.adminToken);
    assert.equal(status, 200);
    ctx.adminUserId = data.userId;
  });

  test('Setup: crear cliente + agente + activar + registrar dispositivo', async () => {
    const client = await req('POST', '/clients', { name: `Alerts Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: 'Alerts Test Agent' }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;
    ctx.agentKey = agent.data.key;

    const activated = await req('POST', '/agents/activate', { key: ctx.agentKey, hardwareId: `ALERTS-HW-${ts}` });
    assert.equal(activated.status, 200);
    ctx.agentToken = activated.data.token;

    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.210.10', mac: null, serial: ctx.deviceSerial, brand: 'hp', model: 'HP LaserJet Alerts', name: 'Alerts Test Device' }],
    }, ctx.agentToken);
    assert.equal(registered.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device, 'Dispositivo debe existir');
    ctx.deviceId = device.id;
  });
});

describe('Alertas — dedupe de tóner (arregla la carrera de alertWorker)', () => {
  test('dos syncs concurrentes con el mismo tóner bajo producen UNA sola alerta toner_black_low', async () => {
    const sync = () => req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.210.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 100, mono_pages: 100, color_pages: 0,
        toner_black: 15, offline: false,
      }],
    }, ctx.agentToken);

    // Concurrentes a propósito: es la condición de carrera que producía duplicados
    // reales en `alertWorker.ts` antes del índice único parcial + ON CONFLICT.
    const [r1, r2] = await Promise.all([sync(), sync()]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);

    const alerts = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&resolved=false`, undefined, ctx.adminToken),
      (r) => r.data.some((a: any) => a.type === 'toner_black_low'),
    );
    const tonerAlerts = alerts.data.filter((a: any) => a.type === 'toner_black_low');
    assert.equal(tonerAlerts.length, 1, 'Debe existir exactamente una alerta toner_black_low, no duplicada');
    ctx.tonerAlertId = tonerAlerts[0].id;
  });
});

describe('Alertas — ciclo de vida (ack/resolve)', () => {
  test('PUT /alerts/:id {acknowledged:true} → reconoce, registra ack_by/ack_at', async () => {
    const { status, data } = await req('PUT', `/alerts/${ctx.tonerAlertId}`, { acknowledged: true }, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.acknowledged, true);
    assert.equal(data.ack_by, ctx.adminUserId);
    assert.ok(data.ack_at);
  });

  test('PUT /alerts/:id {resolved:true} → resuelve, registra resolved_at', async () => {
    const { status, data } = await req('PUT', `/alerts/${ctx.tonerAlertId}`, { resolved: true }, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.resolved, true);
    assert.ok(data.resolved_at);
  });

  test('PUT /alerts/:id sin acknowledged ni resolved → 400', async () => {
    const { status } = await req('PUT', `/alerts/${ctx.tonerAlertId}`, {}, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('PUT /alerts/:id inexistente → 404', async () => {
    const { status } = await req('PUT', '/alerts/999999999', { acknowledged: true }, ctx.adminToken);
    assert.equal(status, 404);
  });
});

describe('Alertas — acción en bloque (Fase 9 del gap analysis vs HP SDS)', () => {
  const bulkCtx = { alertIdA: 0, alertIdB: 0 };

  test('setup: 2 alertas de tóner bajo en 2 equipos nuevos', async () => {
    const serials = [`SN-ALERTS-BULK-A-${ts}`, `SN-ALERTS-BULK-B-${ts}`];
    for (const serial of serials) {
      await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.40.1.${serials.indexOf(serial) + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, toner_black: 15, offline: false }],
      }, ctx.agentToken);
    }
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const deviceIdA = devices.data.find((d: any) => d.serial_number === serials[0]).id;
    const deviceIdB = devices.data.find((d: any) => d.serial_number === serials[1]).id;

    const alertsA = await pollUntil(
      () => req('GET', `/alerts?device_id=${deviceIdA}&resolved=false`, undefined, ctx.adminToken),
      (r) => r.data.some((a: any) => a.type === 'toner_black_low'),
    );
    bulkCtx.alertIdA = alertsA.data.find((a: any) => a.type === 'toner_black_low').id;

    const alertsB = await pollUntil(
      () => req('GET', `/alerts?device_id=${deviceIdB}&resolved=false`, undefined, ctx.adminToken),
      (r) => r.data.some((a: any) => a.type === 'toner_black_low'),
    );
    bulkCtx.alertIdB = alertsB.data.find((a: any) => a.type === 'toner_black_low').id;
  });

  test('POST /alerts/bulk {acknowledged:true} reconoce ambas de una, un id inexistente queda skipped', async () => {
    const res = await req('POST', '/alerts/bulk', { ids: [bulkCtx.alertIdA, bulkCtx.alertIdB, 999999999], acknowledged: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);
    assert.deepEqual(res.data.applied.sort(), [bulkCtx.alertIdA, bulkCtx.alertIdB].sort());
    assert.equal(res.data.skipped[0].reason, 'not_found');

    const a = await req('GET', `/alerts?resolved=false`, undefined, ctx.adminToken);
    const alertA = a.data.find((x: any) => x.id === bulkCtx.alertIdA);
    assert.equal(alertA.acknowledged, true);
  });

  test('POST /alerts/bulk {resolved:true} resuelve ambas', async () => {
    const res = await req('POST', '/alerts/bulk', { ids: [bulkCtx.alertIdA, bulkCtx.alertIdB], resolved: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);
  });

  test('sin ids → 400 (schema)', async () => {
    const { status } = await req('POST', '/alerts/bulk', { resolved: true }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('sin acknowledged ni resolved → 400', async () => {
    const { status } = await req('POST', '/alerts/bulk', { ids: [bulkCtx.alertIdA] }, ctx.adminToken);
    assert.equal(status, 400);
  });
});

describe('Alertas — counter_reset dedupea por tipo, no por mensaje', () => {
  test('un segundo reset mientras el primero sigue abierto no crea una segunda fila', async () => {
    const base = Date.now();
    const sequence = [200, 300, 20]; // 200→300 (normal), 300→20 (reset #1)
    for (let i = 0; i < sequence.length; i++) {
      const { status } = await req('POST', '/devices/sync', {
        readings: [{
          reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.210.10', brand: 'hp',
          time: new Date(base + i * 1000).toISOString(), total_pages: sequence[i], offline: false,
        }],
      }, ctx.agentToken);
      assert.equal(status, 200);
    }

    const afterFirstReset = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=counter_reset`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );
    assert.equal(afterFirstReset.data.length, 1, 'Debe existir exactamente una alerta counter_reset tras el primer reset');
    ctx.counterResetAlertId = afterFirstReset.data[0].id;

    // Reset #2 (60→10) mientras el primero sigue sin resolver — dedupe por
    // (device_id,type) lo suprime a propósito (ver alertService.ts).
    const secondReset = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.210.10', brand: 'hp',
        time: new Date(base + 4000).toISOString(), total_pages: 60, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(secondReset.status, 200);
    await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.210.10', brand: 'hp',
        time: new Date(base + 5000).toISOString(), total_pages: 10, offline: false,
      }],
    }, ctx.agentToken);

    // Dar tiempo a que un eventual (incorrecto) segundo insert aparezca, y confirmar que no.
    await new Promise((r) => setTimeout(r, 1500));
    const stillOne = await req('GET', `/alerts?device_id=${ctx.deviceId}&type=counter_reset`, undefined, ctx.adminToken);
    assert.equal(stillOne.data.length, 1, 'Un segundo reset con el primero sin resolver no debe crear una segunda fila');
    assert.equal(stillOne.data[0].id, ctx.counterResetAlertId);

    // Cerrar la alerta para no interferir con corridas futuras del mismo dispositivo.
    await req('PUT', `/alerts/${ctx.counterResetAlertId}`, { resolved: true }, ctx.adminToken);
  });
});

describe('Notificaciones — PUT /clients/:id configura los canales', () => {
  test('admin puede setear notification_email/notification_webhook_url, y quedan en GET /clients/:id', async () => {
    const { status, data } = await req('PUT', `/clients/${ctx.clientId}`, {
      notification_email: 'alerts@example.com',
      notification_webhook_url: 'https://example.com/hook',
    }, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.notification_email, 'alerts@example.com');
    assert.equal(data.notification_webhook_url, 'https://example.com/hook');

    const { data: fetched } = await req('GET', `/clients/${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(fetched.notification_email, 'alerts@example.com');
  });

  test('mandar "" limpia el canal (sin fallback a contact_email)', async () => {
    const { status, data } = await req('PUT', `/clients/${ctx.clientId}`, { notification_email: '' }, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.notification_email, null);
  });
});

