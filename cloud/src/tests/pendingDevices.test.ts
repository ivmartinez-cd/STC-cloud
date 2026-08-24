// Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS) — Tests
// de integración, mismo criterio que monitorState.test.ts/alerts.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/pendingDevices.test.ts

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

function sync(agentToken: string, serial: string, ip: string, totalPages: number, extra: Record<string, unknown> = {}) {
  return req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: serial, ip, brand: 'hp',
      time: new Date().toISOString(), total_pages: totalPages, toner_black: 80, offline: false,
      ...extra,
    }],
  }, agentToken);
}

const ts = Date.now();
const ctx = {
  adminToken: '',
  clientId: '', agentId: '', agentToken: '',
};

describe('Cola de registro — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `PendingDevices Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente PendingDevices ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-PENDING-${ts}` });
    ctx.agentToken = activate.data.token;
  });
});

describe('Sin flag: sin regresión', () => {
  const serial = `SN-PEND-OFF-${ts}`;
  test('device_approval_required=false (default) → el equipo nuevo entra registered de una', async () => {
    const s = await sync(ctx.agentToken, serial, '192.168.241.10', 100);
    assert.equal(s.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === serial);
    assert.ok(device, 'debe aparecer en el inventario normal');
    assert.equal(device.registration_state, 'registered');

    const pending = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, ctx.adminToken);
    assert.equal(pending.status, 200);
    assert.equal(pending.data.items.some((d: any) => d.serial_number === serial), false);
  });
});

describe('Con flag: cola de pendientes', () => {
  const serialA = `SN-PEND-A-${ts}`;
  const serialB = `SN-PEND-B-${ts}`;
  let deviceIdA = '';
  let deviceIdB = '';

  test('activar device_approval_required en el cliente', async () => {
    const updated = await req('PUT', `/clients/${ctx.clientId}`, { device_approval_required: true }, ctx.adminToken);
    assert.equal(updated.status, 200);
    assert.equal(updated.data.device_approval_required, true);
  });

  test('un equipo nuevo entra pending — no aparece en inventario pero sí en la cola, y la lectura persiste', async () => {
    const s = await sync(ctx.agentToken, serialA, '192.168.241.20', 100);
    assert.equal(s.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    assert.equal(devices.data.some((d: any) => d.serial_number === serialA), false, 'pending no debe aparecer en el inventario');

    const pending = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, ctx.adminToken);
    const row = pending.data.items.find((d: any) => d.serial_number === serialA);
    assert.ok(row, 'debe aparecer en la cola de pendientes');
    deviceIdA = row.id;

    const device = await req('GET', `/devices/${deviceIdA}`, undefined, ctx.adminToken);
    assert.equal(device.data.registration_state, 'pending');
    assert.equal(Number(device.data.total_pages), 100, 'la lectura sí se persiste aunque esté pending (lossless)');
  });

  test('un segundo sync del mismo equipo no duplica la fila y actualiza contadores', async () => {
    const s = await sync(ctx.agentToken, serialA, '192.168.241.20', 150);
    assert.equal(s.status, 200);

    const pending = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, ctx.adminToken);
    const matches = pending.data.items.filter((d: any) => d.serial_number === serialA);
    assert.equal(matches.length, 1, 'no debe duplicar la fila pendiente');

    const device = await req('GET', `/devices/${deviceIdA}`, undefined, ctx.adminToken);
    assert.equal(Number(device.data.total_pages), 150, 'sigue actualizando contadores mientras está pending');
  });

  test('cierre mensual excluye pendientes del preview', async () => {
    const period = new Date().toISOString().slice(0, 7);
    const preview = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=${period}`, undefined, ctx.adminToken);
    assert.equal(preview.status, 200);
    assert.equal(
      preview.data.lines.some((l: any) => l.serial_number === serialA),
      false,
      'un equipo pending no debe facturar'
    );
  });

  test('registrar en bloque → pasa a registered y aparece en el inventario', async () => {
    const register = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, { deviceIds: [deviceIdA] }, ctx.adminToken);
    assert.equal(register.status, 200);
    assert.equal(register.data.registered, 1);
    assert.deepEqual(register.data.skipped, []);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === serialA);
    assert.ok(device, 'ya debe aparecer en el inventario');
    assert.equal(device.registration_state, 'registered');

    const pending = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, ctx.adminToken);
    assert.equal(pending.data.items.some((d: any) => d.serial_number === serialA), false);
  });

  test('registrar de nuevo el mismo id (ya registered) → skipped, no error', async () => {
    const register = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, { deviceIds: [deviceIdA] }, ctx.adminToken);
    assert.equal(register.status, 200);
    assert.equal(register.data.registered, 0);
    assert.equal(register.data.skipped[0]?.reason, 'not_pending');
  });

  test('ignorar en bloque corta lecturas futuras', async () => {
    const s = await sync(ctx.agentToken, serialB, '192.168.241.21', 100);
    assert.equal(s.status, 200);

    const pending = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, ctx.adminToken);
    const row = pending.data.items.find((d: any) => d.serial_number === serialB);
    assert.ok(row);
    deviceIdB = row.id;

    const ignore = await req('POST', `/clients/${ctx.clientId}/pending-devices/ignore`, { deviceIds: [deviceIdB], reason: 'Impresora de otro piso, no es nuestra' }, ctx.adminToken);
    assert.equal(ignore.status, 200);
    assert.equal(ignore.data.ignored, 1);

    const device = await req('GET', `/devices/${deviceIdB}`, undefined, ctx.adminToken);
    assert.equal(device.data.registration_state, 'ignored');

    const s2 = await sync(ctx.agentToken, serialB, '192.168.241.21', 999);
    assert.equal(s2.status, 200);
    await new Promise((r) => setTimeout(r, 500));

    const after = await req('GET', `/devices/${deviceIdB}`, undefined, ctx.adminToken);
    assert.equal(Number(after.data.total_pages), 100, 'ignored no debe actualizar contadores tras el corte');
  });

  test('ignorar sin reason → 400', async () => {
    const { status } = await req('POST', `/clients/${ctx.clientId}/pending-devices/ignore`, { deviceIds: [deviceIdB] }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('unignore vuelve el equipo a pending y reanuda la ingesta', async () => {
    const un = await req('POST', `/devices/${deviceIdB}/unignore`, { reason: 'Error, sí es nuestra' }, ctx.adminToken);
    assert.equal(un.status, 200);
    assert.equal(un.data.registration_state, 'pending');

    const pending = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, ctx.adminToken);
    assert.ok(pending.data.items.some((d: any) => d.id === deviceIdB));

    const s3 = await sync(ctx.agentToken, serialB, '192.168.241.21', 999);
    assert.equal(s3.status, 200);

    const after = await pollUntil(
      () => req('GET', `/devices/${deviceIdB}`, undefined, ctx.adminToken),
      (r) => Number(r.data.total_pages) === 999,
    );
    assert.equal(Number(after.data.total_pages), 999, 'al volver a pending debe reanudar la ingesta');
  });

  test('unignore sobre un equipo que no está ignored → 409', async () => {
    const { status } = await req('POST', `/devices/${deviceIdB}/unignore`, {}, ctx.adminToken);
    assert.equal(status, 409);
  });
});

describe('Cola de registro — validaciones', () => {
  test('register sin deviceIds → 400', async () => {
    const { status } = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, {}, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('register con deviceIds vacío → 400', async () => {
    const { status } = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, { deviceIds: [] }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('register con más de 500 ids → 400', async () => {
    const ids = Array.from({ length: 501 }, () => crypto.randomUUID());
    const { status } = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, { deviceIds: ids }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('register de un id inexistente → skipped, no error', async () => {
    const fakeId = crypto.randomUUID();
    const register = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, { deviceIds: [fakeId] }, ctx.adminToken);
    assert.equal(register.status, 200);
    assert.equal(register.data.registered, 0);
    assert.equal(register.data.skipped[0]?.reason, 'not_found');
  });
});

describe('Cola de registro — RBAC', () => {
  test('client_viewer → 403 en list/register/ignore/unignore', async () => {
    const created = await req('POST', '/portal/users', {
      username: `pending_viewer_${ts}`, password: 'Pending1234!', role: 'client_viewer', client_id: ctx.clientId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: `pending_viewer_${ts}`, password: 'Pending1234!' });
    const viewerToken = login.data.token;

    const list = await req('GET', `/clients/${ctx.clientId}/pending-devices`, undefined, viewerToken);
    assert.equal(list.status, 403);

    const register = await req('POST', `/clients/${ctx.clientId}/pending-devices/register`, { deviceIds: [crypto.randomUUID()] }, viewerToken);
    assert.equal(register.status, 403);

    const ignore = await req('POST', `/clients/${ctx.clientId}/pending-devices/ignore`, { deviceIds: [crypto.randomUUID()], reason: 'x' }, viewerToken);
    assert.equal(ignore.status, 403);

    const un = await req('POST', `/devices/00000000-0000-0000-0000-000000000000/unignore`, {}, viewerToken);
    assert.equal(un.status, 403);
  });
});
