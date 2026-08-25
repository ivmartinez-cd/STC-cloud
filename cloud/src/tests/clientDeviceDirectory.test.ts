// Detalle de cliente hifi (handoff "Cliente — detalle", 25/08/2026) — unitarios
// directos contra Postgres real, mismo criterio de conexión/aislamiento que
// clientDirectory.test.ts (CLIENT_DIRECTORY_TEST_DB_PORT, default 5434): ejercita
// `KnexClientRepository.listDevicesDirectory()`/`.getClientStats()` sin necesitar
// el server HTTP arriba.
//
// Ejecutar: npx tsx --test src/tests/clientDeviceDirectory.test.ts

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib from 'knex';
import { KnexClientRepository } from '../modules/clients/infrastructure/database/knex-client-repository';

const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.CLIENT_DIRECTORY_TEST_DB_HOST || 'localhost',
    port: Number(process.env.CLIENT_DIRECTORY_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});

const repo = new KnexClientRepository(rawDb);
const ts = Date.now();
const PREFIX = `Device Directory Test ${ts}`;
const HOUR = 60 * 60 * 1000;

let clientId = '';
let agentId = '';
const devices = { a: '', b: '', c: '', d: '' };

async function createDevice(overrides: Record<string, unknown>): Promise<string> {
  const [{ id }] = await rawDb('devices')
    .insert({
      client_id: clientId, agent_id: agentId, active: true,
      monitor_state: 'full', registration_state: 'registered',
      ...overrides,
    })
    .returning('id');
  return id as string;
}

async function createAlert(deviceId: string, type: string, alertClass: string | null): Promise<void> {
  await rawDb('alerts').insert({
    device_id: deviceId, type, severity: 'warning', message: 'fixture de test',
    resolved: false, alert_class: alertClass,
  });
}

async function seedClientAndAgent(): Promise<void> {
  const [{ id }] = await rawDb('clients').insert({ name: PREFIX }).returning('id');
  clientId = id as string;
  const [{ id: aId }] = await rawDb('agents')
    .insert({ client_id: clientId, name: `${PREFIX} Agent`, status: 'active', last_seen: rawDb.fn.now() })
    .returning('id');
  agentId = aId as string;
}

// A: en_linea, con 2 alertas abiertas (1 de disponibilidad), tóner normal, gestionado (monitor_state full).
// B: sin_conexion (last_seen > 5hs), consumible bajo (toner 10 <= 35), sin alertas.
// C: sin_reporte (nunca reportó), sin tóner (consumible_pct null), NO gestionado (supplies_only).
// D: dado de baja — no debe aparecer en la tabla ni contar en managed_device_count.
async function seedDevices(): Promise<void> {
  devices.a = await createDevice({
    serial_number: `DDT-A-${ts}`, brand: 'HP', model: `AAA LaserJet ${ts}`, location_override: 'Piso 1',
    last_seen: new Date(), toner_black: 50,
  });
  await createAlert(devices.a, `ddt_avail_${ts}`, 'availability');
  await createAlert(devices.a, `ddt_supply_${ts}`, 'consumable_low');

  devices.b = await createDevice({
    serial_number: `DDT-B-${ts}`, brand: 'Brother', model: `BBB HL-L2350 ${ts}`, location_override: 'Piso 2',
    last_seen: new Date(Date.now() - 6 * HOUR), toner_black: 10,
  });

  devices.c = await createDevice({
    serial_number: `DDT-C-${ts}`, brand: 'Samsung', model: `CCC M4070 ${ts}`, location_override: 'Depósito',
    last_seen: null, monitor_state: 'supplies_only',
  });

  devices.d = await createDevice({
    serial_number: `DDT-D-${ts}`, brand: 'HP', model: `DDD Decommissioned ${ts}`, location_override: 'Piso 3',
    last_seen: new Date(), decommissioned_at: new Date(),
  });
}

before(async () => {
  await seedClientAndAgent();
  await seedDevices();
});

after(async () => {
  await rawDb('clients').where('name', PREFIX).del();
  await rawDb.destroy().catch(() => {});
});

describe('listDevicesDirectory — estado, consumible, alertas, filtros y orden', () => {
  test('trae sólo los equipos vivos (excluye el dado de baja)', async () => {
    const { items, total } = await repo.listDevicesDirectory({ clientId });
    assert.equal(total, 3);
    assert.ok(!items.some((d) => d.id === devices.d));
  });

  test('estado derivado: en_linea / sin_conexion (>5hs) / sin_reporte (nunca reportó)', async () => {
    const { items } = await repo.listDevicesDirectory({ clientId });
    const byId = new Map(items.map((d) => [d.id, d]));
    assert.equal(byId.get(devices.a)!.estado, 'en_linea');
    assert.equal(byId.get(devices.b)!.estado, 'sin_conexion');
    assert.equal(byId.get(devices.c)!.estado, 'sin_reporte');
  });

  test('consumible_pct: mínimo de los tóners no nulos, null si ninguno reporta', async () => {
    const { items } = await repo.listDevicesDirectory({ clientId });
    const byId = new Map(items.map((d) => [d.id, d]));
    assert.equal(byId.get(devices.a)!.consumible_pct, 50);
    assert.equal(byId.get(devices.b)!.consumible_pct, 10);
    assert.equal(byId.get(devices.c)!.consumible_pct, null);
  });

  test('alertas abiertas por dispositivo (join alerts→device_id directo, no por cliente)', async () => {
    const { items } = await repo.listDevicesDirectory({ clientId });
    const byId = new Map(items.map((d) => [d.id, d]));
    assert.equal(byId.get(devices.a)!.alerts_count, 2);
    assert.equal(byId.get(devices.b)!.alerts_count, 0);
    assert.equal(byId.get(devices.c)!.alerts_count, 0);
  });

  test('orden por defecto (alertas desc) trae a A primero', async () => {
    const { items } = await repo.listDevicesDirectory({ clientId });
    assert.equal(items[0].id, devices.a);
  });

  test('segmento sin_conexion → sólo B', async () => {
    const { items, total } = await repo.listDevicesDirectory({ clientId, segment: 'sin_conexion' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.b);
  });

  test('segmento con_alertas → sólo A', async () => {
    const { items, total } = await repo.listDevicesDirectory({ clientId, segment: 'con_alertas' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.a);
  });

  test('segmento consumible_bajo (<=35%) → sólo B (A es 50%, C no reporta tóner)', async () => {
    const { items, total } = await repo.listDevicesDirectory({ clientId, segment: 'consumible_bajo' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.b);
  });

  test('búsqueda por modelo', async () => {
    const { items, total } = await repo.listDevicesDirectory({ clientId, q: `BBB HL-L2350 ${ts}` });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.b);
  });

  test('búsqueda por ubicación', async () => {
    const { items, total } = await repo.listDevicesDirectory({ clientId, q: 'Depósito' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.c);
  });

  test('orden por consumible_pct asc: el sin dato (NULL) siempre al final', async () => {
    const { items } = await repo.listDevicesDirectory({ clientId, sortField: 'consumible_pct', sortDir: 'asc' });
    assert.equal(items[0].id, devices.b);
    assert.equal(items[items.length - 1].id, devices.c);
  });

  test('paginación real (limit/offset)', async () => {
    const page1 = await repo.listDevicesDirectory({ clientId, limit: 1, offset: 0 });
    const page2 = await repo.listDevicesDirectory({ clientId, limit: 1, offset: 1 });
    assert.equal(page1.items.length, 1);
    assert.equal(page1.total, 3);
    assert.notEqual(page1.items[0].id, page2.items[0].id);
  });
});

describe('getClientStats — métricas "requiere atención" del detalle de cliente', () => {
  test('managed_device_count cuenta sólo monitor_state=full vivos (excluye supplies_only y de baja)', async () => {
    const stats = await repo.getClientStats(clientId);
    assert.equal(stats.managed_device_count, 2);
  });

  test('alerts_open_count y alerts_availability_count (subconjunto por alert_class)', async () => {
    const stats = await repo.getClientStats(clientId);
    assert.equal(stats.alerts_open_count, 2);
    assert.equal(stats.alerts_availability_count, 1);
  });
});

const MONTH = 30 * 24 * HOUR;

describe('usageByMonth — ventana de 12 meses (handoff "Consumo mensual", antes 4 meses)', () => {
  test('trae deltas de un mes ~10 meses atrás y del mes actual (dentro de la ventana de 11 meses + 40 días)', async () => {
    const tenMonthsAgo = new Date(Date.now() - 10 * MONTH);
    const tenMonthsAgoPlusDay = new Date(tenMonthsAgo.getTime() + 24 * HOUR);
    await rawDb('readings').insert([
      { device_id: devices.a, time: tenMonthsAgo, mono_pages: 1000, color_pages: 100 },
      { device_id: devices.a, time: tenMonthsAgoPlusDay, mono_pages: 1100, color_pages: 120 },
      { device_id: devices.a, time: new Date(), mono_pages: 1300, color_pages: 150 },
    ]);

    const months = await repo.usageByMonth(clientId);
    // Con datos en sólo 2 meses distintos, la ventana de 12 meses no "rellena" los
    // meses sin lecturas (eso lo hace el front, ver ClientUsageChart.tsx) — sólo no
    // debe RECORTAR a los últimos 4 como antes.
    const oldMonthKey = tenMonthsAgo.toISOString().slice(0, 7);
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const byMonthDate = new Map(months.map((m) => [new Date(m.month_date).toISOString().slice(0, 7), m]));
    assert.ok(byMonthDate.has(oldMonthKey), 'el mes de hace ~10 meses debe estar presente (ventana de 12 meses)');
    assert.equal(byMonthDate.get(oldMonthKey)!.mono, 100);
    assert.equal(byMonthDate.get(oldMonthKey)!.color, 20);
    assert.ok(byMonthDate.has(currentMonthKey));
    assert.equal(byMonthDate.get(currentMonthKey)!.mono, 200);
    assert.equal(byMonthDate.get(currentMonthKey)!.color, 30);
  });
});
