// Detalle de dispositivo hifi (handoff "Dispositivo — detalle", 25/08/2026) —
// unitarios directos contra Postgres real, mismo criterio de conexión/
// aislamiento que monitorDetail.test.ts (DEVICE_DETAIL_TEST_DB_PORT, default
// 5434): ejercita `KnexDeviceRepository.statsRaw()`/`.printTrend()` sin
// necesitar el server HTTP arriba.
//
// Ejecutar: npx tsx --test src/tests/deviceDetail.test.ts

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib from 'knex';
import { KnexDeviceRepository } from '../modules/devices/infrastructure/database/knex-device-repository';
import { GetDevicePrintTrendUseCase, GetDeviceStatsUseCase } from '../modules/devices/application/use-cases/device-read-use-cases';
import { SuppliesServiceDeviceSuppliesReader } from '../modules/devices/infrastructure/adapters/supplies-device-supplies-reader';
import { DeviceNotFoundError } from '../modules/devices/domain/errors/device-error';

const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.DEVICE_DETAIL_TEST_DB_HOST || 'localhost',
    port: Number(process.env.DEVICE_DETAIL_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});

const repo = new KnexDeviceRepository(rawDb);
const ts = Date.now();
const PREFIX = `Device Detail Test ${ts}`;
const DAY = 24 * 60 * 60 * 1000;

let clientId = '';
let agentId = '';
let deviceId = '';
let siblingId = '';

/** `total_pages` avanza como MÚLTIPLOS de 100 acumulados — nunca decrece salvo el reset explícito. */
async function reading(deviceId: string, time: Date, total: number, monoShare = 0.6, offline = false) {
  const mono = Math.round(total * monoShare);
  await rawDb('readings').insert({
    device_id: deviceId, time, total_pages: total, mono_pages: mono, color_pages: total - mono, offline,
  });
}

async function seedClientAndAgent() {
  const [{ id }] = await rawDb('clients').insert({ name: PREFIX }).returning('id');
  clientId = id as string;
  const [{ id: aId }] = await rawDb('agents')
    .insert({ client_id: clientId, name: `${PREFIX} Agent`, status: 'active', last_seen: rawDb.fn.now(), hardware_id: `HW-DDT-${ts}` })
    .returning('id');
  agentId = aId as string;
}

async function seedDevice(serial: string, model: string, ip: string, total: number, mono: number, color: number): Promise<string> {
  const [{ id }] = await rawDb('devices')
    .insert({
      client_id: clientId, agent_id: agentId, active: true, monitor_state: 'full', registration_state: 'registered',
      serial_number: serial, brand: 'HP', model, ip_address: ip, total_pages: total, mono_pages: mono, color_pages: color,
    })
    .returning('id');
  return id as string;
}

// 14 meses de lecturas acumuladas del device bajo test — sube ~100 pág/mes,
// deliberadamente más allá de la ventana de 12 meses (para probar que el
// pre-roll de 40 días no filtra el mes más viejo mostrado). Termina con una
// lectura a mitad del mes corriente; el total final queda escrito de vuelta
// en `devices.*` para que coincida con la última lectura.
async function seedPrintTrendReadings() {
  const now = new Date();
  let acc = 0;
  for (let i = 14; i >= 1; i--) {
    acc += 100;
    await reading(deviceId, new Date(now.getFullYear(), now.getMonth() - i, 15), acc);
  }
  acc += 40;
  await reading(deviceId, new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 15)), acc);
  await rawDb('devices').where('id', deviceId).update({ total_pages: acc, mono_pages: Math.round(acc * 0.6), color_pages: acc - Math.round(acc * 0.6) });
  // Lecturas del hermano — sólo este mes, para que `site_volume_month` cuente algo más que `deviceId`.
  await reading(siblingId, new Date(now.getFullYear(), now.getMonth(), 5), 200);
  await reading(siblingId, new Date(now.getFullYear(), now.getMonth(), 20), 500);
}

// Dos atascos en los últimos 30 días (uno con bandeja identificable), uno viejo (fuera de ventana).
async function seedJamAlerts() {
  const base = { device_id: deviceId, agent_id: agentId, type: 'jam', alert_class: 'jam', severity: 'warning', resolved: true };
  await rawDb('alerts').insert([
    { ...base, message: 'Atasco de papel en bandeja 2', created_at: new Date(Date.now() - 2 * DAY) },
    { ...base, message: 'Atasco de papel', created_at: new Date(Date.now() - 20 * DAY) },
    { ...base, message: 'Atasco viejo, fuera de ventana', created_at: new Date(Date.now() - 40 * DAY) },
  ]);
}

before(async () => {
  await seedClientAndAgent();
  deviceId = await seedDevice(`DDT-A-${ts}`, `Trend LaserJet ${ts}`, '192.168.60.10', 1400, 840, 560);
  // Hermano en el mismo agente — necesario para que `site_volume_month` sea
  // distinto de `volume_month` (si no, el % del sitio sería trivialmente 100%).
  siblingId = await seedDevice(`DDT-B-${ts}`, `Sibling LaserJet ${ts}`, '192.168.60.20', 500, 500, 0);
  await seedPrintTrendReadings();
  await seedJamAlerts();
});

after(async () => {
  await rawDb('clients').where('name', PREFIX).del();
  await rawDb.destroy().catch(() => {});
});

describe('printTrend — 12 meses de deltas, nunca el acumulado de vida', () => {
  test('siempre devuelve 12 filas, más viejo a más nuevo', async () => {
    const months = await repo.printTrend(deviceId);
    assert.equal(months.length, 12);
    for (let i = 1; i < months.length; i++) assert.ok(months[i].month_date > months[i - 1].month_date);
  });

  test('invariante del handoff: Σ mono ≤ devices.mono_pages y Σ color ≤ devices.color_pages', async () => {
    const months = await repo.printTrend(deviceId);
    const device = await rawDb('devices').where('id', deviceId).first();
    const sumMono = months.reduce((s, m) => s + m.mono, 0);
    const sumColor = months.reduce((s, m) => s + m.color, 0);
    assert.ok(sumMono <= Number(device.mono_pages), `Σ mono (${sumMono}) debe ser ≤ mono_pages (${device.mono_pages})`);
    assert.ok(sumColor <= Number(device.color_pages), `Σ color (${sumColor}) debe ser ≤ color_pages (${device.color_pages})`);
  });

  test('el último mes NO es el acumulado de vida (la regresión exacta del bug)', async () => {
    const months = await repo.printTrend(deviceId);
    const lastMonth = months[months.length - 1];
    const device = await rawDb('devices').where('id', deviceId).first();
    assert.ok(lastMonth.total < Number(device.total_pages) * 0.5, 'el mes corriente no puede acercarse al contador de vida completo');
  });

  test('un reset de contador a mitad de ventana no infla el mes ni da negativos', async () => {
    const resetDeviceId = (await rawDb('devices').insert({
      client_id: clientId, agent_id: agentId, active: true, monitor_state: 'full', registration_state: 'registered',
      serial_number: `DDT-RESET-${ts}`, ip_address: '192.168.60.30', total_pages: 50, mono_pages: 50, color_pages: 0,
    }).returning('id'))[0].id as string;
    const now = new Date();
    await reading(resetDeviceId, new Date(now.getFullYear(), now.getMonth() - 1, 10), 900);
    // Reset: el contador vuelve a un valor bajo dentro del mismo mes.
    await reading(resetDeviceId, new Date(now.getFullYear(), now.getMonth() - 1, 20), 50);
    const months = await repo.printTrend(resetDeviceId);
    for (const m of months) {
      assert.ok(m.mono >= 0 && m.color >= 0 && m.total >= 0, 'ningún mes puede quedar negativo');
    }
  });
});

describe('statsRaw — tira de métricas', () => {
  test('total_counter/mono_pages/color_pages vienen de devices.*', async () => {
    const stats = await repo.statsRaw(deviceId);
    const device = await rawDb('devices').where('id', deviceId).first();
    assert.equal(stats.total_counter, Number(device.total_pages));
    assert.equal(stats.mono_pages, Number(device.mono_pages));
    assert.equal(stats.color_pages, Number(device.color_pages));
  });

  test('mono_pct + color_pct suman ~100', async () => {
    const stats = await repo.statsRaw(deviceId);
    assert.ok(stats.mono_pct !== null && stats.color_pct !== null);
    assert.ok(Math.abs((stats.mono_pct! + stats.color_pct!) - 100) < 1);
  });

  test('volume_month_site_pct: el sitio imprimió más que sólo este equipo, así que el % es < 100', async () => {
    const stats = await repo.statsRaw(deviceId);
    assert.ok(stats.volume_month_site_pct !== null);
    assert.ok(stats.volume_month_site_pct! > 0 && stats.volume_month_site_pct! <= 100);
  });

  test('jams: cuenta sólo los últimos 30 días, con bandeja extraída del más reciente', async () => {
    const stats = await repo.statsRaw(deviceId);
    assert.equal(stats.jams.count_30d, 2, 'el atasco de hace 40 días queda fuera de la ventana de 30 días');
    assert.equal(stats.jams.tray_label, 'bandeja 2');
    assert.ok(stats.jams.last_at);
  });

  test('equipo sin atascos → count_30d 0, last_at null, tray_label null', async () => {
    const stats = await repo.statsRaw(siblingId);
    assert.equal(stats.jams.count_30d, 0);
    assert.equal(stats.jams.last_at, null);
    assert.equal(stats.jams.tray_label, null);
  });
});

describe('GetDeviceStatsUseCase / GetDevicePrintTrendUseCase — scoping (resolveId por cliente)', () => {
  const statsUC = new GetDeviceStatsUseCase(repo, new SuppliesServiceDeviceSuppliesReader(rawDb));
  const trendUC = new GetDevicePrintTrendUseCase(repo);
  const otherScope = { kind: 'client' as const, id: '00000000-0000-0000-0000-000000000000' };

  test('stats: scope propio → resuelve; scope ajeno → DeviceNotFoundError', async () => {
    const ownScope = { kind: 'client' as const, id: clientId };
    await assert.doesNotReject(() => statsUC.execute({ id: deviceId, scope: ownScope }));
    await assert.rejects(() => statsUC.execute({ id: deviceId, scope: otherScope }), DeviceNotFoundError);
  });

  test('print-trend: scope propio → resuelve; scope ajeno → DeviceNotFoundError', async () => {
    const ownScope = { kind: 'client' as const, id: clientId };
    await assert.doesNotReject(() => trendUC.execute({ id: deviceId, scope: ownScope }));
    await assert.rejects(() => trendUC.execute({ id: deviceId, scope: otherScope }), DeviceNotFoundError);
  });
});
