// Campos de inventario manuales/derivados (Fase 4 del gap analysis vs HP SDS)
// — Tests de integración, mismo criterio que deviceUsageHistory.test.ts/
// alerts.test.ts (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/inventoryFields.test.ts

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
// manualmente (mismo criterio que deviceUsageHistory.test.ts).
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
const brand = `InvTestBrand${ts}`;
const model = `InvTestModel${ts}`;
const ctx = {
  adminToken: '',
  clientId: '', agentId: '', agentToken: '',
  deviceSerial: `SN-INV-${ts}`, deviceId: '',
  selectFieldId: '', selectFieldKey: `criticidad_${ts % 100000}`,
};

describe('Inventario — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Inventory Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Inventory ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-INV-${ts}` });
    ctx.agentToken = activate.data.token;

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.230.10', brand, model,
        time: new Date().toISOString(), total_pages: 1000, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device);
    ctx.deviceId = device.id;
  });
});

describe('Inventario — asset_number: override vs reported vs limpiar', () => {
  test('PUT asset_number persiste como override, GET lo devuelve', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}`, { asset_number: 'ACT-00123' }, ctx.adminToken);
    assert.equal(put.status, 200);

    const get = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(get.data.asset_number, 'ACT-00123');
    assert.equal(get.data.asset_number_override, 'ACT-00123');
    assert.equal(get.data.asset_number_reported, null, 'nada lo reporta todavía — Fase 10 del roadmap');
  });

  test('mandar "" limpia el override (vuelve a NULL, no queda string vacío)', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}`, { asset_number: '' }, ctx.adminToken);
    assert.equal(put.status, 200);
    const get = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(get.data.asset_number_override, null);
    assert.equal(get.data.asset_number, null);
  });

  test('asset_tag y duty_cycle_monthly también se persisten', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}`, { asset_tag: 'INV-4521', duty_cycle_monthly: 5000 }, ctx.adminToken);
    assert.equal(put.status, 200);
    const get = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(get.data.asset_tag, 'INV-4521');
    assert.equal(get.data.duty_cycle_monthly_override, 5000);
    assert.equal(get.data.duty_cycle_effective, 5000, 'sin catálogo, el override es el valor efectivo');
  });
});

describe('Inventario — campos personalizados', () => {
  test('crear una definición type=select', async () => {
    const created = await req('POST', `/clients/${ctx.clientId}/custom-fields`, {
      key: ctx.selectFieldKey, label: 'Criticidad', type: 'select', options: ['baja', 'media', 'alta'],
    }, ctx.adminToken);
    assert.equal(created.status, 201);
    assert.equal(created.data.key, ctx.selectFieldKey);
    ctx.selectFieldId = created.data.id;

    const list = await req('GET', `/clients/${ctx.clientId}/custom-fields`, undefined, ctx.adminToken);
    assert.ok(list.data.some((f: any) => f.id === ctx.selectFieldId));
  });

  test('valor fuera de las opciones → 400', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}`, { custom_data: { [ctx.selectFieldKey]: 'urgentisima' } }, ctx.adminToken);
    assert.equal(put.status, 400);
  });

  test('clave de campo personalizado desconocida → 400', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}`, { custom_data: { campo_que_no_existe: 'x' } }, ctx.adminToken);
    assert.equal(put.status, 400);
  });

  test('valor válido → persiste en custom_data, y no borra otros campos ya seteados', async () => {
    const put1 = await req('PUT', `/devices/${ctx.deviceId}`, { custom_data: { [ctx.selectFieldKey]: 'alta' } }, ctx.adminToken);
    assert.equal(put1.status, 200);
    const get1 = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    const data1 = typeof get1.data.custom_data === 'string' ? JSON.parse(get1.data.custom_data) : get1.data.custom_data;
    assert.equal(data1[ctx.selectFieldKey], 'alta');

    // Editar asset_tag (campo distinto) no debe pisar custom_data.
    await req('PUT', `/devices/${ctx.deviceId}`, { asset_tag: 'INV-9999' }, ctx.adminToken);
    const get2 = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    const data2 = typeof get2.data.custom_data === 'string' ? JSON.parse(get2.data.custom_data) : get2.data.custom_data;
    assert.equal(data2[ctx.selectFieldKey], 'alta', 'custom_data debe sobrevivir a un update de otro campo');
  });

  test('archivar el campo → deja de listarse', async () => {
    const del = await req('DELETE', `/clients/${ctx.clientId}/custom-fields/${ctx.selectFieldId}`, undefined, ctx.adminToken);
    assert.equal(del.status, 200);
    const list = await req('GET', `/clients/${ctx.clientId}/custom-fields`, undefined, ctx.adminToken);
    assert.ok(!list.data.some((f: any) => f.id === ctx.selectFieldId));
  });
});

describe('Inventario — uso de 30 días (readings_daily_agg)', () => {
  test('3 lecturas en 3 días distintos → pages_30d = suma de deltas positivos', async () => {
    const day = 24 * 60 * 60 * 1000;
    const base = Date.now() - 2 * day;
    const points = [
      { time: new Date(base).toISOString(), total_pages: 1000 },
      { time: new Date(base + day).toISOString(), total_pages: 1050 },
      { time: new Date(base + 2 * day).toISOString(), total_pages: 1120 },
    ];
    for (const p of points) {
      const sync = await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.230.10', brand, model, offline: false, ...p }],
      }, ctx.agentToken);
      assert.equal(sync.status, 200);
    }

    await rawDb.raw(`CALL refresh_continuous_aggregate('readings_daily_agg', NULL, NULL)`);

    const get = await pollUntil(
      () => req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken),
      (r) => r.data.pages_30d != null && Number(r.data.pages_30d) > 0,
    );
    // día1-día0 = 50, día2-día1 = 70 → 120 (el primer día no tiene LAG previo, no cuenta)
    assert.equal(Number(get.data.pages_30d), 120);
  });
});

describe('Inventario — duty_cycle_effective cae al catálogo sin override', () => {
  test('sin device_models ni override → null', async () => {
    // Segundo equipo del mismo agente, marca/modelo únicos, sin tocar duty_cycle_monthly.
    const serial2 = `SN-INV-CATALOG-${ts}`;
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serial2, ip: '192.168.230.20', brand, model: `${model}-NoCatalog`, time: new Date().toISOString(), total_pages: 10, offline: false }],
    }, ctx.agentToken);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device2 = devices.data.find((d: any) => d.serial_number === serial2);
    const get = await req('GET', `/devices/${device2.id}`, undefined, ctx.adminToken);
    assert.equal(get.data.duty_cycle_effective, null);
  });

  test('con device_models catalogado (mismo brand/model) → duty_cycle_effective viene del catálogo', async () => {
    const created = await req('POST', '/device-models', { brand, model_key: model.toLowerCase(), duty_cycle_monthly: 8000 }, ctx.adminToken);
    assert.equal(created.status, 201);

    // El primer equipo (ctx.deviceId) YA tiene un override de 5000 seteado arriba
    // — el override debe seguir ganando por sobre el catálogo.
    const get1 = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(get1.data.duty_cycle_effective, 5000, 'el override sigue ganando aunque exista catálogo');

    // Un tercer equipo del mismo brand/model, SIN override, sí debe heredar el catálogo.
    const serial3 = `SN-INV-CATALOG2-${ts}`;
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serial3, ip: '192.168.230.30', brand, model, time: new Date().toISOString(), total_pages: 10, offline: false }],
    }, ctx.agentToken);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device3 = devices.data.find((d: any) => d.serial_number === serial3);
    const get3 = await req('GET', `/devices/${device3.id}`, undefined, ctx.adminToken);
    assert.equal(get3.data.duty_cycle_effective, 8000);
  });
});

describe('Inventario — RBAC (client_viewer sólo lectura de catálogos)', () => {
  test('Setup: crear client_viewer atado al cliente', async () => {
    const created = await req('POST', '/portal/users', {
      username: `inv_viewer_${ts}`, password: 'InvViewer1234!', role: 'client_viewer', client_id: ctx.clientId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
  });

  test('GET /clients/:id/custom-fields y /device-models: 200 para cualquier rol autenticado', async () => {
    const login = await req('POST', '/portal/login', { username: `inv_viewer_${ts}`, password: 'InvViewer1234!' });
    const viewerToken = login.data.token;
    const fields = await req('GET', `/clients/${ctx.clientId}/custom-fields`, undefined, viewerToken);
    assert.equal(fields.status, 200);
    const models = await req('GET', '/device-models', undefined, viewerToken);
    assert.equal(models.status, 200);
  });

  test('POST /clients/:id/custom-fields → 403 para client_viewer', async () => {
    const login = await req('POST', '/portal/login', { username: `inv_viewer_${ts}`, password: 'InvViewer1234!' });
    const viewerToken = login.data.token;
    const { status } = await req('POST', `/clients/${ctx.clientId}/custom-fields`, { key: 'x', label: 'x', type: 'text' }, viewerToken);
    assert.equal(status, 403);
  });
});
