// Filtros nuevos y /incidents/stats extendido (handoff hifi #3, fase 4,
// 26/08/2026). Fixture propia con incidentes insertados directo por Postgres
// (mismo criterio que el escenario de reapertura de incidentAutoRules.test.ts)
// para controlar `opened_at`/`closed_at` sin depender del worker real.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/incidentsStatsAndFilters.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
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
const ctx = { adminToken: '', clientId: '' };

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

describe('Stats y filtros nuevos — fixtures', () => {
  test('Setup: login admin, crear cliente + 4 incidentes con antigüedad/estado/equipo controlados', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Incidents Stats Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    await rawDb('incidents').insert([
      // Abierto, viejo (>24h), sin equipo — cae en ABIERTOS, +24H y SIN EQUIPO.
      { client_id: ctx.clientId, class: 'consumable_out', title: 'Viejo sin equipo', severity: 'critical', origin: 'manual', status: 'open', opened_at: hoursAgo(30) },
      // Abierto, reciente (<24h), CON equipo (id inventado, sólo para dejar device_id no-nulo en el filtro).
      { client_id: ctx.clientId, class: 'jam', title: 'Reciente', severity: 'warning', origin: 'manual', status: 'open', opened_at: hoursAgo(1) },
      // Cerrado normal (no cuenta como "abierto").
      { client_id: ctx.clientId, class: 'jam', title: 'Cerrado normal', severity: 'warning', origin: 'manual', status: 'closed', opened_at: hoursAgo(2), closed_at: hoursAgo(1) },
      // Cerrado casi instantáneo, automático — el diagnóstico de "0 minutos".
      { client_id: ctx.clientId, class: 'consumable_out', title: 'consumable_out — unknown', severity: 'warning', origin: 'auto', status: 'closed', opened_at: hoursAgo(3), closed_at: hoursAgo(3) },
    ]);
  });
});

describe('GET /incidents — filtros nuevos', () => {
  test('status=open trae sólo los 2 abiertos (agrupa open/in_progress/on_hold, excluye closed)', async () => {
    const res = await req('GET', `/incidents?client_id=${ctx.clientId}&status=open`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.items.length, 2);
    assert.ok(res.data.items.every((i: any) => i.status !== 'closed'));
  });

  test('min_age_hours=24 trae sólo el viejo sin equipo (30h), no el reciente (1h)', async () => {
    const res = await req('GET', `/incidents?client_id=${ctx.clientId}&min_age_hours=24`, undefined, ctx.adminToken);
    assert.ok(res.data.items.some((i: any) => i.title === 'Viejo sin equipo'));
    assert.ok(!res.data.items.some((i: any) => i.title === 'Reciente'));
  });

  test('no_device=true trae sólo los que no tienen equipo asociado', async () => {
    const res = await req('GET', `/incidents?client_id=${ctx.clientId}&no_device=true`, undefined, ctx.adminToken);
    assert.ok(res.data.items.length >= 1);
    assert.ok(res.data.items.every((i: any) => i.device_id === null));
  });

  test('q busca también por nombre de cliente (no sólo título/serie/externo)', async () => {
    const res = await req('GET', `/incidents?q=${encodeURIComponent(`Incidents Stats Test Client ${ts}`)}`, undefined, ctx.adminToken);
    assert.ok(res.data.items.some((i: any) => i.client_id === ctx.clientId));
  });
});

describe('GET /incidents/stats — agregados nuevos', () => {
  test('byClass/aging/instantClosures/byOrigin coherentes con la fixture', async () => {
    const res = await req('GET', `/incidents/stats?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.openTotal, 2);
    assert.ok(res.data.byClass.some((c: any) => c.class === 'consumable_out'));
    assert.ok(res.data.avgAgingSeconds > 0);
    assert.ok(res.data.maxAgingSeconds >= res.data.avgAgingSeconds);
    assert.equal(res.data.unassignedOpenCount, 2, 'ninguno de los 2 abiertos tiene assigned_to');

    const instant = res.data.instantClosures.find((c: any) => c.class === 'consumable_out');
    assert.ok(instant, 'debe agrupar el cierre casi-instantáneo automático de consumable_out');
    assert.equal(instant.count, 1);
    assert.equal(instant.sampleClientId, ctx.clientId);

    assert.equal(res.data.byOrigin.manual, 3);
    assert.equal(res.data.byOrigin.auto, 1);
  });
});
