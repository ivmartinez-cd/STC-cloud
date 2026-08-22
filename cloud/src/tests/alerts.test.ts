// Alertas: ciclo de vida (ack/resolve) + dedupe — Tests de integración, mismo
// criterio que e2e.test.ts/rbac.test.ts (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/alerts.test.ts
//
// El worker de tóner (`alertWorker.ts`) corre asíncrono vía BullMQ — el sync HTTP
// devuelve 200 antes de que la alerta exista. `pollUntil` reintenta unos segundos
// en vez de asumir que ya está lista apenas responde `/devices/sync`.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knexLib from 'knex';
import { sendAlertWebhook } from '../services/notificationService';

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
// (no hay generador real de `agent_offline` todavía — llega en la Fase 2 de este
// mismo trabajo) y así probar el LEFT JOIN de `getAlerts` sin depender de esa fase.
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
  adminToken: '', adminUserId: '',
  clientId: '', agentId: '', agentKey: '', agentToken: '',
  deviceSerial: `SN-ALERTS-${ts}`, deviceId: '',
  tonerAlertId: 0,
  ewsAlertId: 0,
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

describe('Alertas EWS — auto-resolución cuando el equipo deja de reportarlas', () => {
  test('una alerta EWS se abre con código de vendor y se resuelve sola cuando el sync ya no la incluye', async () => {
    const opened = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.210.10', brand: 'hp',
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
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.210.10', brand: 'hp',
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
    assert.equal(found.client_name, `Alerts Test Client ${ts}`);
    assert.equal(found.agent_name, 'Alerts Test Agent');
    assert.equal(found.device_id, null);

    const resolvedFalse = await req('GET', '/alerts?resolved=false&type=agent_offline', undefined, ctx.adminToken);
    assert.ok(resolvedFalse.data.some((a: any) => a.id === syntheticId));

    await rawDb('alerts').where({ id: syntheticId }).delete();
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

describe('Notificaciones — guard SSRF del webhook (sin red: sólo los casos que no requieren DNS)', () => {
  const dummyPayload = {
    alertId: 0, type: 'test', severity: 'critical', message: 'prueba',
    deviceName: null, agentName: null, clientId: ctx.clientId, clientName: 'Test',
  };

  test('rechaza http:// (exige https)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'http://example.com/hook'), /https/i);
  });

  test('rechaza loopback literal (127.0.0.1)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://127.0.0.1/hook'), /red interna/i);
  });

  test('rechaza el IP de metadata de nube (169.254.169.254)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://169.254.169.254/hook'), /red interna/i);
  });

  test('rechaza un rango privado RFC1918 (10.x)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://10.0.0.5/hook'), /red interna/i);
  });

  test('rechaza IPv6 loopback (::1)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://[::1]/hook'), /red interna/i);
  });
});
