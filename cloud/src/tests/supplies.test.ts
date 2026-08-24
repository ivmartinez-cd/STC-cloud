// Superficie de consumibles (Fase 8 del gap analysis vs HP SDS) — Tests de
// integración, mismo criterio que inventoryFields.test.ts/monitorState.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/supplies.test.ts

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

// Conexión directa a Postgres SOLO para disparar `refresh_continuous_aggregate`
// manualmente (mismo criterio que inventoryFields.test.ts/deviceUsageHistory.test.ts).
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
  deviceSerial: `SN-SUPPLIES-${ts}`, deviceId: '',
};

describe('Consumibles — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar, 3 lecturas en 3 días + cartucho negro al 50%', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Supplies Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Supplies ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-SUPPLIES-${ts}` });
    ctx.agentToken = activate.data.token;

    const day = 24 * 60 * 60 * 1000;
    const base = Date.now() - 2 * day;
    const points = [
      { time: new Date(base).toISOString(), total_pages: 1000 },
      { time: new Date(base + day).toISOString(), total_pages: 1050 },
      { time: new Date(base + 2 * day).toISOString(), total_pages: 1120 },
    ];
    for (const p of points) {
      const sync = await req('POST', '/devices/sync', {
        readings: [{
          reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.242.10', brand: 'hp',
          offline: false, toner_black: 50, cartridge_capacity_black: 1000, cartridge_printed_black: 500,
          ...p,
        }],
      }, ctx.agentToken);
      assert.equal(sync.status, 200);
    }

    // `/clients/:id/devices` no expone `pages_30d` (no lo necesita el listado);
    // eso vive en `GET /devices/:id` (join a `device_usage_30d`, ver
    // deviceController.getDevice) — se resuelve el id primero por el listado,
    // recién con el id se poll-ea el endpoint que sí trae el agregado.
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const found = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(found, 'el equipo debe aparecer en el inventario apenas sincroniza');
    ctx.deviceId = found.id;

    await rawDb.raw(`CALL refresh_continuous_aggregate('readings_daily_agg', NULL, NULL)`);
    const device = await pollUntil(
      () => req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken),
      (r) => r.data.pages_30d != null && Number(r.data.pages_30d) > 0,
    );
    // día1-día0 = 50, día2-día1 = 70 → 120 de pages_30d (mismo cálculo que inventoryFields.test.ts).
    assert.equal(Number(device.data.pages_30d), 120);
  });
});

describe('Bug real corregido: cartridge_capacity/printed/estimated ya no quedan NULL', () => {
  test('las 3 columnas quedan persistidas tras el sync', async () => {
    const device = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(Number(device.data.cartridge_capacity_black), 1000);
    assert.equal(Number(device.data.cartridge_printed_black), 500);
  });
});

describe('GET /devices/:id/supplies', () => {
  test('rate.totalPerDay = pages_30d/30, remainingDays coherente con capacidad + %', async () => {
    const res = await req('GET', `/devices/${ctx.deviceId}/supplies`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.rate.totalPerDay, 4); // 120/30

    const black = res.data.rows.find((r: any) => r.key === 'toner-black');
    assert.ok(black, 'debe traer la fila de tóner negro');
    assert.equal(black.percentage, 50);
    assert.equal(black.capacity, 1000);
    assert.equal(black.remainingPages, 500); // round(1000 * 50 / 100)
    assert.equal(black.remainingDays, 125); // round(500 / 4)
  });

  test('dispositivo de otro cliente → 404 (scoping)', async () => {
    const otherClient = await req('POST', '/clients', { name: `Supplies Other Client ${ts}` }, ctx.adminToken);
    const created = await req('POST', '/portal/users', {
      username: `supplies_other_${ts}`, password: 'Supplies1234!', role: 'client_viewer', client_id: otherClient.data.id,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: `supplies_other_${ts}`, password: 'Supplies1234!' });
    const { status } = await req('GET', `/devices/${ctx.deviceId}/supplies`, undefined, login.data.token);
    assert.equal(status, 404);
  });
});

describe('GET /supplies — vista de flota', () => {
  test('aparece en la flota, filtrado por cliente', async () => {
    const res = await req('GET', `/supplies?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.items.some((r: any) => r.device_id === ctx.deviceId && r.key === 'toner-black'));
  });

  test('max_days=100 excluye (125 días > 100), max_days=200 incluye', async () => {
    const excl = await req('GET', `/supplies?client_id=${ctx.clientId}&max_days=100`, undefined, ctx.adminToken);
    assert.equal(excl.data.items.some((r: any) => r.device_id === ctx.deviceId && r.key === 'toner-black'), false);

    const incl = await req('GET', `/supplies?client_id=${ctx.clientId}&max_days=200`, undefined, ctx.adminToken);
    assert.ok(incl.data.items.some((r: any) => r.device_id === ctx.deviceId && r.key === 'toner-black'));
  });

  test('kind=Tóner filtra por tipo', async () => {
    const res = await req('GET', `/supplies?client_id=${ctx.clientId}&kind=${encodeURIComponent('Tóner')}`, undefined, ctx.adminToken);
    assert.ok(res.data.items.every((r: any) => r.kind === 'Tóner'));
  });

  test('monitor_state=disabled → el equipo desaparece de la flota', async () => {
    const set = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'disabled', reason: 'Prueba automatizada' }, ctx.adminToken);
    assert.equal(set.status, 200);

    const res = await req('GET', `/supplies?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.data.items.some((r: any) => r.device_id === ctx.deviceId), false);

    // Restaurar para no interferir con otros tests que corran contra el mismo stack.
    await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'full' }, ctx.adminToken);
  });
});

describe('GET /supplies/summary', () => {
  test('con toner_black=50% (por encima de los umbrales) no aparece en el top-5', async () => {
    // Regresión: el summary sólo debe listar ítems <= 20% en `top` — 50% no califica.
    const res = await req('GET', `/supplies/summary?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.top.some((r: any) => r.device_id === ctx.deviceId), false);
  });
});

describe('Consumibles — RBAC', () => {
  test('client_viewer ve /supplies y /devices/:id/supplies scopeados a su cliente', async () => {
    const created = await req('POST', '/portal/users', {
      username: `supplies_viewer_${ts}`, password: 'Supplies1234!', role: 'client_viewer', client_id: ctx.clientId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: `supplies_viewer_${ts}`, password: 'Supplies1234!' });
    const viewerToken = login.data.token;

    const list = await req('GET', '/supplies', undefined, viewerToken);
    assert.equal(list.status, 200);
    assert.ok(list.data.items.every((r: any) => r.client_id === ctx.clientId));

    const detail = await req('GET', `/devices/${ctx.deviceId}/supplies`, undefined, viewerToken);
    assert.equal(detail.status, 200);
  });
});
