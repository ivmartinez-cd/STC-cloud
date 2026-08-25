// Listado hifi de "Clientes" (handoff 25/08/2026) — unitarios directos contra
// Postgres real, mismo criterio de conexión que alertDigest.test.ts/alerts.test.ts
// (CLIENT_DIRECTORY_TEST_DB_PORT, default 5434): ejercita `KnexClientRepository
// .listDirectory()`/`.getPortfolioSummary()` sin necesitar el server HTTP arriba
// (no hay job/`setInterval` que guardar acá, a diferencia de alertDigestJob).
// Ejecutar: npx tsx --test src/tests/clientDirectory.test.ts
//
// La búsqueda `q` con el prefijo único `Directory Test {ts}` es lo que aísla estos
// tests del resto de los datos de la base compartida por la suite (~1000+ clientes
// reales/de prueba, ver README del handoff) — sin esto, ordenar/paginar sobre
// `scope: {kind:'all'}` sería no determinístico.

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
const PREFIX = `Directory Test ${ts}`;

async function createClient(suffix: string, contactName: string | null): Promise<string> {
  const [{ id }] = await rawDb('clients')
    .insert({ name: `${PREFIX} ${suffix}`, contact_name: contactName })
    .returning('id');
  return id as string;
}

async function createAgent(clientId: string): Promise<string> {
  const [{ id }] = await rawDb('agents')
    .insert({ client_id: clientId, name: `${PREFIX} Agent`, status: 'active', last_seen: rawDb.fn.now() })
    .returning('id');
  return id as string;
}

let deviceSeq = 0;
async function createDevice(clientId: string, agentId: string, lastSeen: Date | null): Promise<string> {
  deviceSeq += 1;
  const [{ id }] = await rawDb('devices')
    .insert({
      client_id: clientId, agent_id: agentId, serial_number: `DIR-TEST-${ts}-${deviceSeq}`,
      brand: 'TestBrand', model: 'TestModel', active: true, last_seen: lastSeen,
    })
    .returning('id');
  return id as string;
}

let alertSeq = 0;
async function createOpenAlert(deviceId: string): Promise<void> {
  alertSeq += 1;
  await rawDb('alerts').insert({
    device_id: deviceId, type: `dir_test_alert_${ts}_${alertSeq}`, severity: 'warning',
    message: 'fixture de test', resolved: false,
  });
}

const HOUR = 60 * 60 * 1000;

// clientA: contacto + 3 equipos recientes, sin alertas → activo.
// clientB: contacto + 2 equipos recientes + 2 alertas abiertas → activo CON alertas
//          (demuestra que "con alertas" es independiente de `estado`).
// clientC: contacto + 1 equipo con último reporte de hace 30h (>24h) → sin_reporte.
// clientD: SIN contacto + 1 equipo recién reportado → sin_contacto (prioridad sobre
//          el reporte, aunque el reporte esté al día).
// clientE: contacto + CERO equipos (nunca reportó) → sin_reporte (last_report_at null).
const ids = { A: '', B: '', C: '', D: '', E: '' };

before(async () => {
  ids.A = await createClient('A', `A. Contacto ${ts}`);
  const agentA = await createAgent(ids.A);
  await createDevice(ids.A, agentA, new Date());
  await createDevice(ids.A, agentA, new Date());
  await createDevice(ids.A, agentA, new Date());

  ids.B = await createClient('B', `B. Contacto ${ts}`);
  const agentB = await createAgent(ids.B);
  const deviceB1 = await createDevice(ids.B, agentB, new Date());
  await createDevice(ids.B, agentB, new Date());
  await createOpenAlert(deviceB1);
  await createOpenAlert(deviceB1);

  ids.C = await createClient('C', `C. Contacto ${ts}`);
  const agentC = await createAgent(ids.C);
  await createDevice(ids.C, agentC, new Date(Date.now() - 30 * HOUR));

  ids.D = await createClient('D', null);
  const agentD = await createAgent(ids.D);
  await createDevice(ids.D, agentD, new Date());

  ids.E = await createClient('E', `E. Contacto ${ts}`);
  await createAgent(ids.E);
});

after(async () => {
  // Cascada: clients → agents/devices (client_id) → alerts (device_id).
  await rawDb('clients').where('name', 'like', `${PREFIX}%`).del();
  await rawDb.destroy().catch(() => {});
});

describe('listDirectory — orden, estado, alertas y último reporte', () => {
  test('orden por defecto (equipos desc, empate por nombre asc) trae los 5 clientes de prueba', async () => {
    const { items, total } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX });
    assert.equal(total, 5);
    assert.deepEqual(items.map((r) => r.id), [ids.A, ids.B, ids.C, ids.D, ids.E]);
    assert.deepEqual(items.map((r) => r.device_count), [3, 2, 1, 1, 0]);
  });

  test('estado derivado: sin_contacto tiene prioridad sobre reporte al día; sin_reporte cubre "nunca reportó"', async () => {
    const { items } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX });
    const byId = new Map(items.map((r) => [r.id, r]));
    assert.equal(byId.get(ids.A)!.estado, 'activo');
    assert.equal(byId.get(ids.B)!.estado, 'activo');
    assert.equal(byId.get(ids.C)!.estado, 'sin_reporte');
    assert.equal(byId.get(ids.D)!.estado, 'sin_contacto');
    assert.equal(byId.get(ids.E)!.estado, 'sin_reporte');
  });

  test('alertas abiertas por cliente (join alerts→devices→agents, mismo criterio que alertDigestJob)', async () => {
    const { items } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX });
    const byId = new Map(items.map((r) => [r.id, r]));
    assert.equal(byId.get(ids.A)!.alerts_count, 0);
    assert.equal(byId.get(ids.B)!.alerts_count, 2);
    assert.equal(byId.get(ids.E)!.alerts_count, 0);
  });

  test('último reporte: null cuando el cliente nunca tuvo un equipo reportando', async () => {
    const { items } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX });
    const byId = new Map(items.map((r) => [r.id, r]));
    assert.equal(byId.get(ids.E)!.last_report_at, null);
    assert.ok(byId.get(ids.A)!.last_report_at != null);
    assert.ok(byId.get(ids.C)!.last_report_at != null);
  });

  test('segmento sin_contacto → sólo D', async () => {
    const { items, total } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, segment: 'sin_contacto' });
    assert.equal(total, 1);
    assert.equal(items[0].id, ids.D);
  });

  test('segmento con_alertas → sólo B (independiente del estado)', async () => {
    const { items, total } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, segment: 'con_alertas' });
    assert.equal(total, 1);
    assert.equal(items[0].id, ids.B);
  });

  test('segmento sin_reporte_24h → C y E, ordenados por equipos desc', async () => {
    const { items, total } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, segment: 'sin_reporte_24h' });
    assert.equal(total, 2);
    assert.deepEqual(items.map((r) => r.id), [ids.C, ids.E]);
  });

  test('orden por alertas desc trae a B primero', async () => {
    const { items } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, sortField: 'alerts_count', sortDir: 'desc' });
    assert.equal(items[0].id, ids.B);
  });

  test('orden por último reporte asc: el más viejo (C, ~30h) primero; el que nunca reportó (E, NULL) siempre al final', async () => {
    const { items } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, sortField: 'last_report_at', sortDir: 'asc' });
    assert.equal(items[0].id, ids.C);
    assert.equal(items[items.length - 1].id, ids.E);
  });

  test('orden por último reporte desc: el que nunca reportó (E, NULL) sigue al final, no al frente', async () => {
    const { items } = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, sortField: 'last_report_at', sortDir: 'desc' });
    assert.equal(items[items.length - 1].id, ids.E);
  });

  test('búsqueda por contacto (no sólo por nombre)', async () => {
    const { items, total } = await repo.listDirectory({ scope: { kind: 'all' }, q: `B. Contacto ${ts}` });
    assert.equal(total, 1);
    assert.equal(items[0].id, ids.B);
  });

  test('paginación real (limit/offset) sobre el orden por defecto', async () => {
    const page1 = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, limit: 2, offset: 0 });
    const page2 = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, limit: 2, offset: 2 });
    const page3 = await repo.listDirectory({ scope: { kind: 'all' }, q: PREFIX, limit: 2, offset: 4 });
    assert.deepEqual(page1.items.map((r) => r.id), [ids.A, ids.B]);
    assert.deepEqual(page2.items.map((r) => r.id), [ids.C, ids.D]);
    assert.deepEqual(page3.items.map((r) => r.id), [ids.E]);
    assert.equal(page1.total, 5);
    assert.equal(page2.total, 5);
  });

  test('scope "client" restringe a un único cliente (mismo criterio que /clients/:id)', async () => {
    const { items, total } = await repo.listDirectory({ scope: { kind: 'client', id: ids.A } });
    assert.equal(total, 1);
    assert.equal(items[0].id, ids.A);
  });
});

describe('getPortfolioSummary — tira de métricas de cartera', () => {
  test('scope de un único cliente (determinístico, sin ruido de otros clientes)', async () => {
    const summary = await repo.getPortfolioSummary({ kind: 'client', id: ids.A });
    assert.equal(summary.clients_total, 1);
    assert.equal(summary.devices_total, 3);
    assert.equal(summary.monitors_total, 1);
    assert.equal(summary.with_contact, 1);
    assert.equal(summary.without_contact, 0);
    assert.equal(summary.with_open_alerts, 0);
    assert.equal(summary.open_alerts_total, 0);
    assert.equal(summary.top5_device_count, 3);
    assert.equal(summary.top5_device_share_pct, 100);
  });

  test('cliente sin contacto asignado cuenta en without_contact', async () => {
    const summary = await repo.getPortfolioSummary({ kind: 'client', id: ids.D });
    assert.equal(summary.with_contact, 0);
    assert.equal(summary.without_contact, 1);
  });

  test('cliente con alertas abiertas cuenta en with_open_alerts/open_alerts_total', async () => {
    const summary = await repo.getPortfolioSummary({ kind: 'client', id: ids.B });
    assert.equal(summary.with_open_alerts, 1);
    assert.equal(summary.open_alerts_total, 2);
  });

  test('scope "all" — smoke test (la base compartida tiene más clientes que los de este archivo)', async () => {
    const summary = await repo.getPortfolioSummary({ kind: 'all' });
    assert.ok(summary.clients_total >= 5, 'debe incluir al menos los 5 clientes de este archivo');
    assert.ok(summary.devices_total >= 7, 'debe incluir al menos los 7 equipos de este archivo (3+2+1+1+0)');
    assert.ok(summary.top5_device_share_pct >= 0 && summary.top5_device_share_pct <= 100);
  });
});
