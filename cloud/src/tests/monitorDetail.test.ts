// Detalle de monitor hifi (handoff "Monitor — detalle", 25/08/2026) — unitarios
// directos contra Postgres real, mismo criterio de conexión/aislamiento que
// clientDeviceDirectory.test.ts (MONITOR_DETAIL_TEST_DB_PORT, default 5434):
// ejercita `KnexAgentPortalRepository.listDevicesDirectory()`/`.getStats()`/
// `.getConnectivity30d()`/`.getRecentActivity()`/`.getLicense()` sin necesitar
// el server HTTP arriba.
//
// Ejecutar: npx tsx --test src/tests/monitorDetail.test.ts

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib from 'knex';
import { KnexAgentPortalRepository } from '../modules/agents/infrastructure/database/knex-agent-portal-repository';

const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.MONITOR_DETAIL_TEST_DB_HOST || 'localhost',
    port: Number(process.env.MONITOR_DETAIL_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});

const repo = new KnexAgentPortalRepository(rawDb);
const ts = Date.now();
const PREFIX = `Monitor Detail Test ${ts}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let clientId = '';
let agentId = '';
const devices = { a: '', b: '', c: '' };

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

async function createAlert(overrides: Record<string, unknown>): Promise<void> {
  await rawDb('alerts').insert({ severity: 'warning', message: 'fixture de test', resolved: false, ...overrides });
}

before(async () => {
  const [{ id }] = await rawDb('clients').insert({ name: PREFIX }).returning('id');
  clientId = id as string;
  // "Emitida" hace 200 días — deja al menos una rotación de 90 días en el pasado,
  // para poder afirmar que `proxima_rotacion_at` cae en el futuro.
  const createdAt = new Date(Date.now() - 200 * DAY);
  const [{ id: aId }] = await rawDb('agents')
    .insert({
      client_id: clientId, name: `${PREFIX} Agent`, status: 'active', last_seen: rawDb.fn.now(),
      hardware_id: `HW-${ts}`, created_at: createdAt,
    })
    .returning('id');
  agentId = aId as string;

  // A: en línea, con alerta de disponibilidad abierta, tóner normal, gestionado.
  devices.a = await createDevice({
    serial_number: `MDT-A-${ts}`, brand: 'HP', model: `AAA LaserJet ${ts}`,
    ip_address: '192.168.50.10', last_seen: new Date(), toner_black: 60,
  });
  await createAlert({ device_id: devices.a, type: `mdt_avail_${ts}`, alert_class: 'availability', resolved: false });

  // B: sin conexión (>5hs), consumible bajo, sin alertas.
  devices.b = await createDevice({
    serial_number: `MDT-B-${ts}`, brand: 'Brother', model: `BBB HL-L2350 ${ts}`,
    ip_address: '192.168.50.20', last_seen: new Date(Date.now() - 6 * HOUR), toner_black: 12,
  });

  // C: descubierto, pendiente de aprobación — debe aparecer con estado `sin_aprobar`.
  devices.c = await createDevice({
    serial_number: `MDT-C-${ts}`, brand: 'Samsung', model: `CCC M4070 ${ts}`,
    ip_address: '192.168.50.30', last_seen: null, registration_state: 'pending',
  });

  // Episodio agent_offline resuelto "ayer" (dentro de la ventana de 30 días):
  // 90 minutos de corte parcial, para poder afirmar downtime/reconexión del día.
  // Anclado al mediodía UTC de ayer (no a `Date.now() - DAY`): con eso, si la
  // suite corre entre 22:30 y 00:00 UTC, `resolved_at` (+90min) caía después
  // de medianoche — DENTRO de "hoy" en vez de "ayer" — partiendo el episodio
  // entre dos días y rompiendo ambas aserciones de abajo. Bug real encontrado
  // corriendo la suite completa en ese horario, 26/08/2026.
  const todayUtcMidnight = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const yesterdayNoonUtc = new Date(todayUtcMidnight.getTime() - DAY + 12 * HOUR);
  await rawDb('alerts').insert({
    agent_id: agentId, type: 'agent_offline', severity: 'critical', message: 'fixture de test',
    resolved: true, created_at: yesterdayNoonUtc, resolved_at: new Date(yesterdayNoonUtc.getTime() + 90 * 60 * 1000),
  });

  // Comando de barrido exitoso — alimenta `last_sweep_at`/`last_sweep_new_count`.
  await rawDb('agent_commands').insert({
    agent_id: agentId, type: 'FORCE_SCAN', status: 'success',
    executed_at: new Date(Date.now() - 30 * 60 * 1000),
  });

  // Acción administrativa auditada sobre el agente — alimenta "Actividad reciente".
  await rawDb('audit_logs').insert({
    action: 'UPDATE_CONFIG', target_id: agentId, client_id: clientId, metadata: {},
  });
});

after(async () => {
  await rawDb('clients').where('name', PREFIX).del();
  await rawDb.destroy().catch(() => {});
});

describe('listDevicesDirectory (agentId) — estado, consumible, alertas, filtros y orden', () => {
  test('trae los 3 equipos (incluye el pendiente de aprobar)', async () => {
    const { items, total } = await repo.listDevicesDirectory({ agentId });
    assert.equal(total, 3);
  });

  test('estado derivado: en_linea / sin_conexion (>5hs) / sin_aprobar (pending)', async () => {
    const { items } = await repo.listDevicesDirectory({ agentId });
    const byId = new Map(items.map((d) => [d.id, d]));
    assert.equal(byId.get(devices.a)!.estado, 'en_linea');
    assert.equal(byId.get(devices.b)!.estado, 'sin_conexion');
    assert.equal(byId.get(devices.c)!.estado, 'sin_aprobar');
  });

  test('alertas abiertas por dispositivo', async () => {
    const { items } = await repo.listDevicesDirectory({ agentId });
    const byId = new Map(items.map((d) => [d.id, d]));
    assert.equal(byId.get(devices.a)!.alerts_count, 1);
    assert.equal(byId.get(devices.b)!.alerts_count, 0);
  });

  test('segmento sin_aprobar → sólo C', async () => {
    const { items, total } = await repo.listDevicesDirectory({ agentId, segment: 'sin_aprobar' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.c);
  });

  test('segmento con_alertas → sólo A', async () => {
    const { items, total } = await repo.listDevicesDirectory({ agentId, segment: 'con_alertas' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.a);
  });

  test('búsqueda por IP (columna INET — regresión del cast a texto)', async () => {
    const { items, total } = await repo.listDevicesDirectory({ agentId, q: '192.168.50.20' });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.b);
  });

  test('búsqueda por modelo', async () => {
    const { items, total } = await repo.listDevicesDirectory({ agentId, q: `AAA LaserJet ${ts}` });
    assert.equal(total, 1);
    assert.equal(items[0].id, devices.a);
  });

  test('paginación real (limit/offset)', async () => {
    const page1 = await repo.listDevicesDirectory({ agentId, limit: 1, offset: 0 });
    const page2 = await repo.listDevicesDirectory({ agentId, limit: 1, offset: 1 });
    assert.equal(page1.items.length, 1);
    assert.equal(page1.total, 3);
    assert.notEqual(page1.items[0].id, page2.items[0].id);
  });
});

describe('getStats — tira de 6 métricas del sitio', () => {
  test('devices_total/active cuentan sólo equipos gestionados vivos (no el pendiente)', async () => {
    const stats = await repo.getStats(agentId);
    assert.equal(stats.devices_total, 2);
    assert.equal(stats.devices_active, 1);
    assert.equal(stats.devices_offline, 1);
  });

  test('alerts_open/alerts_availability', async () => {
    const stats = await repo.getStats(agentId);
    assert.equal(stats.alerts_open, 1);
    assert.equal(stats.alerts_availability, 1);
  });

  test('discovered_pending cuenta el equipo sin aprobar', async () => {
    const stats = await repo.getStats(agentId);
    assert.equal(stats.discovered_pending, 1);
  });

  test('last_sweep_at viene del comando FORCE_SCAN exitoso', async () => {
    const stats = await repo.getStats(agentId);
    assert.ok(stats.last_sweep_at);
  });

  test('downtime_30d_minutes/outages_30d reflejan el episodio de ayer (~90 min)', async () => {
    const stats = await repo.getStats(agentId);
    assert.equal(stats.outages_30d, 1);
    assert.ok(stats.downtime_30d_minutes >= 89 && stats.downtime_30d_minutes <= 91);
    assert.ok(stats.uptime_30d_pct > 99 && stats.uptime_30d_pct < 100);
  });
});

describe('getConnectivity30d — 30 días, uno con corte parcial', () => {
  test('devuelve 30 días, el de ayer marcado parcial con downtime > 0', async () => {
    const days = await repo.getConnectivity30d(agentId);
    assert.equal(days.length, 30);
    const yesterdayKey = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    const yesterdayRow = days.find((d) => d.date === yesterdayKey);
    assert.ok(yesterdayRow, 'debe existir una fila para el día de ayer');
    assert.equal(yesterdayRow!.status, 'parcial');
    assert.ok(yesterdayRow!.downtime_minutes > 0);
    assert.equal(yesterdayRow!.reconnects, 1);
  });

  test('un día sin ningún episodio queda online', async () => {
    const days = await repo.getConnectivity30d(agentId);
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayRow = days.find((d) => d.date === todayKey);
    assert.ok(todayRow);
    assert.equal(todayRow!.status, 'online');
    assert.equal(todayRow!.downtime_minutes, 0);
  });
});

describe('getRecentActivity — fusiona alertas + auditoría + comandos', () => {
  test('incluye la alerta de disponibilidad abierta, el comando de barrido y la acción administrativa', async () => {
    const events = await repo.getRecentActivity(agentId, 20);
    assert.ok(events.some((e) => e.kind === 'incidencia'));
    assert.ok(events.some((e) => e.kind === 'barrido' && e.text.includes('Barrido')));
    assert.ok(events.some((e) => e.kind === 'administrativo'));
  });

  test('respeta el límite pedido', async () => {
    const events = await repo.getRecentActivity(agentId, 2);
    assert.ok(events.length <= 2);
  });
});

describe('getLicense — vigencia, hardware id, organización vinculada', () => {
  test('estado vigente + hardware_id + próxima rotación en el futuro', async () => {
    const license = await repo.getLicense(agentId);
    assert.ok(license);
    assert.equal(license!.estado, 'vigente');
    assert.equal(license!.hardware_id, `HW-${ts}`);
    assert.ok(license!.proxima_rotacion_at.getTime() > Date.now());
    assert.equal(license!.rotacion_dias, 90);
  });

  test('organización vinculada trae nombre y conteos del cliente', async () => {
    const license = await repo.getLicense(agentId);
    assert.equal(license!.organizacion.nombre, PREFIX);
    assert.equal(license!.organizacion.device_count, 3);
    assert.equal(license!.organizacion.monitor_count, 1);
  });

  test('agente inexistente → null', async () => {
    const license = await repo.getLicense('00000000-0000-0000-0000-000000000000');
    assert.equal(license, null);
  });
});
