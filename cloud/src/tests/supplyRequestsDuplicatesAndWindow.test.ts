// Pedidos de consumibles — duplicados y ventana temporal de /stats (handoff
// hifi #3, fase 3, 26/08/2026). Separado de supplyRequests.test.ts (deuda de
// sizes-baseline, ese archivo ya estaba cerca del límite de 300 líneas) —
// fixture propia, liviana: no espera ticks del worker de detección (2 min),
// crea los pedidos manuales directo por API.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/supplyRequestsDuplicatesAndWindow.test.ts

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

/* eslint-disable @typescript-eslint/no-explicit-any */
async function req(method: string, path: string, body?: unknown, token?: string) {
  const isBodyless = body === undefined;
  const headers: Record<string, string> = {};
  if (!isBodyless) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers, body: isBodyless ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', agentToken: '', deviceId: '' };

describe('Pedidos — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + equipo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const client = await req('POST', '/clients', { name: `SupplyReq Dup Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente SupplyReq Dup ${ts}` }, ctx.adminToken);
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-SUPPLYREQ-DUP-${ts}` });
    ctx.agentToken = activate.data.token;
    const serial = `SN-SUPPLYREQ-DUP-${ts}`;
    const sync = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: '192.168.243.10', brand: 'hp', time: new Date().toISOString(), total_pages: 10, offline: false }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    ctx.deviceId = devices.data.find((d: any) => d.serial_number === serial).id;
  });
});

describe('Pedidos — posible duplicado real (mismo equipo, mismo consumible)', () => {
  test('dos pedidos manuales del mismo equipo + mismo tóner SÍ se marcan duplicados entre sí', async () => {
    const a = await req('POST', '/supply-requests', { client_id: ctx.clientId, device_id: ctx.deviceId, supply_kind: 'Tóner', supply_color: 'Cian' }, ctx.adminToken);
    const b = await req('POST', '/supply-requests', { client_id: ctx.clientId, device_id: ctx.deviceId, supply_kind: 'Tóner', supply_color: 'Cian' }, ctx.adminToken);
    assert.equal(a.status, 201, JSON.stringify(a.data));
    assert.equal(b.status, 201, JSON.stringify(b.data));

    const list = await req('GET', `/supply-requests?client_id=${ctx.clientId}&status=pending`, undefined, ctx.adminToken);
    const rowA = list.data.items.find((r: any) => r.id === a.data.id);
    const rowB = list.data.items.find((r: any) => r.id === b.data.id);
    assert.equal(rowA.possible_duplicate_of, b.data.id);
    assert.equal(rowB.possible_duplicate_of, a.data.id);
  });
});

describe('Pedidos — posible duplicado (mismo consumible, dos pedidos abiertos)', () => {
  test('dos pedidos manuales del mismo tóner (sin equipo puntual) NO se marcan duplicados — el índice/chequeo es por device_id', async () => {
    // Sin device_id, cada uno tiene supply_key `manual:...` pero device_id=null,
    // y `duplicateSiblingIds` exige `whereNotNull('device_id')` — dos pedidos
    // "sueltos" del mismo cliente no deben cruzarse entre sí como si fueran del
    // mismo equipo.
    const a = await req('POST', '/supply-requests', { client_id: ctx.clientId, supply_kind: 'Tóner', supply_color: 'Negro' }, ctx.adminToken);
    const b = await req('POST', '/supply-requests', { client_id: ctx.clientId, supply_kind: 'Tóner', supply_color: 'Negro' }, ctx.adminToken);
    assert.equal(a.status, 201, JSON.stringify(a.data));
    assert.equal(b.status, 201, JSON.stringify(b.data));

    const list = await req('GET', `/supply-requests?client_id=${ctx.clientId}&status=pending`, undefined, ctx.adminToken);
    const rowA = list.data.items.find((r: any) => r.id === a.data.id);
    const rowB = list.data.items.find((r: any) => r.id === b.data.id);
    assert.equal(rowA.possible_duplicate_of, null);
    assert.equal(rowB.possible_duplicate_of, null);
  });
});

describe('Pedidos — GET /supply-requests/stats con ventana temporal', () => {
  test('sin from/to, la ventana por defecto es de 30 días y trae completed/autoCount/manualCount', async () => {
    const res = await req('GET', `/supply-requests/stats?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.window);
    assert.equal(typeof res.data.window.completed, 'number');
    assert.equal(typeof res.data.window.autoCount, 'number');
    assert.equal(typeof res.data.window.manualCount, 'number');
    assert.equal(res.data.window.autoCount + res.data.window.manualCount, res.data.window.completed);
    // El shape viejo (conteo plano por status) sigue presente — no rompe a los consumidores existentes.
    assert.equal(typeof res.data.pending, 'number');
  });

  test('from/to en el futuro (sin actividad) da completed=0', async () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const res = await req('GET', `/supply-requests/stats?client_id=${ctx.clientId}&from=${future}&to=${future}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.window.completed, 0);
  });
});
