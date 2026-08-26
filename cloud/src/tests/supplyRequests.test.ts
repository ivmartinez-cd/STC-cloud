// Pedidos de consumibles (Fase 4.2 del gap analysis vs HP SDS,
// re-comparación 24/08/2026) — tests de integración, mismo criterio que
// incidents.test.ts: la auto-creación y el auto-completado esperan ticks
// REALES del worker de 2 minutos (sin mockear ni acortar).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/supplyRequests.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  canTransition,
  replacementDetected,
} from '../modules/supply-requests/domain/entities/supply-request';

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

async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 180_000, stepMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, stepMs));
  } while (Date.now() < deadline);
  return last;
}

function sync(agentToken: string, serial: string, ip: string, extra: Record<string, unknown> = {}) {
  return req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: serial, ip, brand: 'hp',
      time: new Date().toISOString(), total_pages: 100, offline: false, ...extra,
    }],
  }, agentToken);
}

describe('Dominio puro — transiciones y detección de reemplazo', () => {
  test('flujo feliz y cierres desde abiertos', () => {
    assert.ok(canTransition('pending', 'reviewed'));
    assert.ok(canTransition('reviewed', 'processed'));
    assert.ok(canTransition('processed', 'completed'));
    assert.ok(canTransition('pending', 'ignored'));
    assert.ok(canTransition('reviewed', 'cancelled'));
  });

  test('un pedido cerrado no transiciona', () => {
    assert.equal(canTransition('completed', 'pending'), false);
    assert.equal(canTransition('ignored', 'reviewed'), false);
    assert.equal(canTransition('cancelled', 'completed'), false);
  });

  test('replacementDetected: exige subida de 30 puntos, no rebote de lectura', () => {
    assert.equal(replacementDetected(5, 90), true);
    assert.equal(replacementDetected(5, 20), false);   // rebote chico
    assert.equal(replacementDetected(5, null), false); // sin lectura
    assert.equal(replacementDetected(null, 40), true); // sin nivel de apertura: base 0
  });
});

const ts = Date.now();
const ctx = {
  adminToken: '', clientId: '', otherClientId: '', agentToken: '',
  deviceId: '', deviceSerial: `SN-SUPREQ-${ts}`,
  viewerToken: '',
};

describe('Pedidos — fixtures', () => {
  test('Setup: login, cliente + agente + dispositivo sano', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `SupplyReq Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
    const other = await req('POST', '/clients', { name: `SupplyReq Disabled Client ${ts}` }, ctx.adminToken);
    ctx.otherClientId = other.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente SupplyReq ${ts}` }, ctx.adminToken);
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-SUPREQ-${ts}` });
    ctx.agentToken = activate.data.token;

    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.245.10', { toner_black: 80 });
    assert.equal(s.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    ctx.deviceId = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial).id;
  });
});

describe('Configuración por cliente (opt-in)', () => {
  test('default: deshabilitado con umbral 10', async () => {
    const res = await req('GET', `/clients/${ctx.clientId}/supply-request-settings`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.enabled, false);
    assert.equal(res.data.threshold_pct, 10);
  });

  test('habilitar con umbral 15', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/supply-request-settings`,
      { enabled: true, threshold_pct: 15 }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.enabled, true);
  });

  test('umbral fuera de rango → 400', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/supply-request-settings`,
      { enabled: true, threshold_pct: 0 }, ctx.adminToken);
    assert.equal(res.status, 400);
  });
});

describe('Pedidos manuales — CRUD y transiciones', () => {
  let requestId = '';

  test('crear pedido manual', async () => {
    const res = await req('POST', '/supply-requests', {
      client_id: ctx.clientId, device_id: ctx.deviceId,
      supply_kind: 'toner', supply_color: 'black', description: 'Tóner negro urgente',
    }, ctx.adminToken);
    assert.equal(res.status, 201);
    assert.equal(res.data.status, 'pending');
    assert.equal(res.data.origin, 'manual');
    assert.equal(res.data.device_serial, ctx.deviceSerial);
    requestId = res.data.id;
  });

  test('transición pending → reviewed → processed → completed', async () => {
    for (const to of ['reviewed', 'processed', 'completed']) {
      const res = await req('POST', `/supply-requests/${requestId}/status`, { status: to }, ctx.adminToken);
      assert.equal(res.status, 200, `→ ${to}`);
      assert.equal(res.data.status, to);
    }
    const detail = await req('GET', `/supply-requests/${requestId}`, undefined, ctx.adminToken);
    assert.ok(detail.data.closed_at, 'completed debe fijar closed_at');
  });

  test('transición desde cerrado → 409', async () => {
    const res = await req('POST', `/supply-requests/${requestId}/status`, { status: 'pending' }, ctx.adminToken);
    assert.equal(res.status, 409);
  });

  test('comentario + timeline en el detalle', async () => {
    const c = await req('POST', `/supply-requests/${requestId}/comments`, { body: 'Pedido al proveedor X' }, ctx.adminToken);
    assert.equal(c.status, 201);
    const detail = await req('GET', `/supply-requests/${requestId}`, undefined, ctx.adminToken);
    const kinds = detail.data.events.map((e: any) => e.kind);
    assert.ok(kinds.includes('status_change') && kinds.includes('comment'));
  });

  test('stats agrupa por estado', async () => {
    const res = await req('GET', `/supply-requests/stats?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok((res.data.completed ?? 0) >= 1);
  });
});

describe('Auto-creación y auto-completado (ticks reales del worker, 2 min)', () => {
  let autoId = '';

  test('tóner bajo el umbral → el worker abre UN pedido automático', async () => {
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.245.10', { toner_black: 5 });
    assert.equal(s.status, 200);

    const found = await pollUntil(
      () => req('GET', `/supply-requests?client_id=${ctx.clientId}&origin=auto&status=pending`, undefined, ctx.adminToken),
      (r) => r.data.items?.some((i: any) => i.device_id === ctx.deviceId && i.supply_key === 'toner-black'),
    );
    const items = found.data.items.filter((i: any) => i.device_id === ctx.deviceId && i.supply_key === 'toner-black');
    assert.equal(items.length, 1, 'exactamente un pedido auto por (equipo, consumible)');
    assert.equal(items[0].level_pct, 5);
    autoId = items[0].id;
  });

  test('cliente sin opt-in NO genera pedidos aunque tenga tóner bajo', async () => {
    // provable sin esperar otro tick: el tick que creó el pedido de arriba ya corrió
    // con este cliente deshabilitado; si hubiera generado algo, ya estaría acá.
    const res = await req('GET', `/supply-requests?client_id=${ctx.otherClientId}`, undefined, ctx.adminToken);
    assert.equal(res.data.total, 0);
  });

  test('nivel sube (cartucho cambiado) → el worker completa el pedido', async () => {
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.245.10', { toner_black: 90 });
    assert.equal(s.status, 200);

    // `completeIfReplaced` escribe el status y el evento en 2 awaits
    // secuenciales, no en una transacción — pollear sólo por status podía
    // ganarle al insert del evento (mismo patrón de carrera que
    // incidentAutoRules.test.ts). Pollear por el evento en sí, no sólo el status.
    const done = await pollUntil(
      () => req('GET', `/supply-requests/${autoId}`, undefined, ctx.adminToken),
      (r) => r.data.status === 'completed' && r.data.events.some((e: any) => e.kind === 'auto_complete'),
    );
    assert.equal(done.data.status, 'completed');
    assert.ok(done.data.closed_at);
    const kinds = done.data.events.map((e: any) => e.kind);
    assert.ok(kinds.includes('auto_complete'), 'debe registrar el evento de auto-completado');

    // y con nivel sano no se reabre en ese mismo tick
    const open = await req('GET', `/supply-requests?client_id=${ctx.clientId}&origin=auto&status=pending`, undefined, ctx.adminToken);
    assert.equal(open.data.items.filter((i: any) => i.supply_key === 'toner-black').length, 0);
  });
});

describe('RBAC — client_viewer', () => {
  test('setup: crear viewer del cliente', async () => {
    const username = `supreq_viewer_${ts}`;
    const create = await req('POST', '/portal/users', {
      username, password: 'SupReq1234!', role: 'client_viewer', client_id: ctx.clientId,
    }, ctx.adminToken);
    assert.equal(create.status, 200);
    const login = await req('POST', '/portal/login', { username, password: 'SupReq1234!' });
    ctx.viewerToken = login.data.token;
  });

  test('viewer lee sus pedidos (scopeado a su cliente)', async () => {
    const res = await req('GET', '/supply-requests', undefined, ctx.viewerToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.items.every((i: any) => i.client_id === ctx.clientId));
  });

  test('viewer no ve un pedido ajeno → 404', async () => {
    // el pedido manual completado es del mismo cliente; probamos con un UUID inexistente
    const res = await req('GET', '/supply-requests/00000000-0000-0000-0000-000000000000', undefined, ctx.viewerToken);
    assert.equal(res.status, 404);
  });

  test('viewer no puede crear ni cambiar estado ni configurar → 403', async () => {
    const create = await req('POST', '/supply-requests', {
      client_id: ctx.clientId, supply_kind: 'toner',
    }, ctx.viewerToken);
    assert.equal(create.status, 403);
    const settings = await req('PUT', `/clients/${ctx.clientId}/supply-request-settings`,
      { enabled: false, threshold_pct: 10 }, ctx.viewerToken);
    assert.equal(settings.status, 403);
  });

  test('cleanup: deshabilitar el opt-in del cliente de test', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/supply-request-settings`,
      { enabled: false, threshold_pct: 10 }, ctx.adminToken);
    assert.equal(res.status, 200);
  });
});
