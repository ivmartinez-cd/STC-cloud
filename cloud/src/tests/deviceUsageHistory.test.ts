// Historial de uso (agregados continuos readings_daily_agg/readings_monthly_agg)
// — Tests de integración, mismo criterio que alerts.test.ts/e2e.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/deviceUsageHistory.test.ts

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
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

// Conexión directa a Postgres SOLO para disparar `refresh_continuous_aggregate`
// manualmente — el endpoint público no lo expone (los agregados se refrescan
// solos por policy cada 1h/6h; el test no puede esperar tanto).
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
  deviceSerial: `SN-USAGE-${ts}`, deviceId: '',
};

describe('Historial de uso — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `UsageHistory Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente UsageHistory ${ts}` }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;
    ctx.agentKey = agent.data.key;

    const activate = await req('POST', '/agents/activate', { key: ctx.agentKey, hardwareId: `HW-USAGE-${ts}` });
    assert.equal(activate.status, 200);
    ctx.agentToken = activate.data.token;

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.250.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 1500, mono_pages: 1400, color_pages: 100, toner_black: 60, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device, 'debe existir el dispositivo recién sincronizado');
    ctx.deviceId = device.id;
  });
});

describe('GET /devices/:id/usage-history', () => {
  test('sin refresh manual, antes de que corra la policy → puede venir vacío (no es lectura inmediata)', async () => {
    const res = await req('GET', `/devices/${ctx.deviceId}/usage-history`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    // No se afirma vacío ni no-vacío acá a propósito (depende de si la policy
    // ya corrió) — el punto de este test es sólo que el endpoint responde 200
    // con un array, nunca un error, esté o no materializado todavía.
  });

  test('tras refresh manual → aparece el bucket diario con los datos reales', async () => {
    await rawDb.raw(`CALL refresh_continuous_aggregate('readings_daily_agg', NULL, NULL)`);
    const res = await req('GET', `/devices/${ctx.deviceId}/usage-history?granularity=daily`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].total_pages, 1500);
    assert.equal(res.data[0].mono_pages, 1400);
    assert.equal(res.data[0].color_pages, 100);
    assert.equal(res.data[0].toner_black, 60);
    assert.equal(res.data[0].reading_count, '1');
  });

  test('granularity=monthly, tras refresh manual → mismo dato agregado por mes', async () => {
    await rawDb.raw(`CALL refresh_continuous_aggregate('readings_monthly_agg', NULL, NULL)`);
    const res = await req('GET', `/devices/${ctx.deviceId}/usage-history?granularity=monthly`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].total_pages, 1500);
    // El agregado mensual no trae columnas de tóner (sólo el diario) — se
    // confirma que el shape de la respuesta cambia según granularity.
    assert.equal(res.data[0].toner_black, undefined);
  });

  test('device de otro cliente → 404 (scoping)', async () => {
    const otherClient = await req('POST', '/clients', { name: `UsageHistory Other Client ${ts}` }, ctx.adminToken);
    const viewer = await req('POST', '/portal/users', {
      username: `usage_viewer_${ts}`, password: 'ViewerPass1234', role: 'client_viewer', client_id: otherClient.data.id,
    }, ctx.adminToken);
    assert.equal(viewer.status, 200);
    const viewerLogin = await req('POST', '/portal/login', { username: `usage_viewer_${ts}`, password: 'ViewerPass1234' });
    assert.equal(viewerLogin.status, 200);

    const res = await req('GET', `/devices/${ctx.deviceId}/usage-history`, undefined, viewerLogin.data.token);
    assert.equal(res.status, 404, 'un client_viewer de OTRO cliente no debe poder leer el usage-history de este device');
  });

  test('id inexistente (uuid válido) → 404', async () => {
    const res = await req('GET', '/devices/00000000-0000-0000-0000-000000000000/usage-history', undefined, ctx.adminToken);
    assert.equal(res.status, 404);
  });

  test('limit se respeta y tiene un tope (365)', async () => {
    const res = await req('GET', `/devices/${ctx.deviceId}/usage-history?granularity=daily&limit=1000`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.length <= 365);
  });
});
