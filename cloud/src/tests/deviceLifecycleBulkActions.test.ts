// Acciones en bloque sobre dispositivos (Fase 9 del gap analysis vs HP SDS).
// Separado de deviceLifecycle.test.ts (deuda de sizes-baseline, 2026-08-26)
// sólo por tamaño de archivo; fixture propia (mismos 2 clientes + 3 agentes)
// porque corre en su propio proceso y las 3 describes originales no dependen
// de `ctx.deviceId` (crean sus propios equipos por bloque).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/deviceLifecycleBulkActions.test.ts

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

const ts = Date.now();

const ctx = {
  adminToken: '',
  clientAId: '', clientBId: '',
  agentA1Id: '', agentA1Token: '',
  agentA2Id: '', agentA2Token: '',
  agentBId: '', agentBToken: '',
};

describe('Acciones en bloque — fixtures', () => {
  test('Setup: login admin + 2 clientes + 3 agentes (2 del mismo cliente A, 1 de B)', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const clientA = await req('POST', '/clients', { name: `Bulk Actions Test A ${ts}` }, ctx.adminToken);
    ctx.clientAId = clientA.data.id;
    const clientB = await req('POST', '/clients', { name: `Bulk Actions Test B ${ts}` }, ctx.adminToken);
    ctx.clientBId = clientB.data.id;

    for (const [key, tokenKey, clientId, name] of [
      ['agentA1Id', 'agentA1Token', ctx.clientAId, 'Sede A1'],
      ['agentA2Id', 'agentA2Token', ctx.clientAId, 'Sede A2'],
      ['agentBId', 'agentBToken', ctx.clientBId, 'Sede B'],
    ] as const) {
      const agent = await req('POST', '/agents', { clientId, name }, ctx.adminToken);
      const activated = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-BULK-${key}-${ts}` });
      (ctx as any)[key] = agent.data.agentId;
      (ctx as any)[tokenKey] = activated.data.token;
    }
  });
});

describe('Acciones en bloque (Fase 9 del gap analysis vs HP SDS) — dar de baja / reactivar', () => {
  const bulkCtx = { d1: '', d2: '' };

  test('setup: 2 equipos nuevos en el cliente A', async () => {
    const points = [`SN-BULK-DEC-1-${ts}`, `SN-BULK-DEC-2-${ts}`];
    for (const [i, serial] of points.entries()) {
      const sync = await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.30.1.${i + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, offline: false }],
      }, ctx.agentA1Token);
      assert.equal(sync.status, 200);
    }
    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    bulkCtx.d1 = devices.data.find((d: any) => d.serial_number === points[0]).id;
    bulkCtx.d2 = devices.data.find((d: any) => d.serial_number === points[1]).id;
  });

  test('dryRun clasifica pero no muta', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await req('POST', '/devices/bulk/decommission',
      { ids: [bulkCtx.d1, bulkCtx.d2, fakeId], reason: 'Prueba en bloque', dryRun: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);
    assert.deepEqual(res.data.applied.sort(), [bulkCtx.d1, bulkCtx.d2].sort());
    assert.equal(res.data.skipped.length, 1);
    assert.equal(res.data.skipped[0].reason, 'not_found');

    const d1 = await req('GET', `/devices/${bulkCtx.d1}`, undefined, ctx.adminToken);
    assert.equal(d1.data.decommissioned_at, null, 'dryRun no debe mutar nada');
  });

  test('confirmación real da de baja N equipos con una sola fila de audit', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await req('POST', '/devices/bulk/decommission',
      { ids: [bulkCtx.d1, bulkCtx.d2, fakeId], reason: 'Prueba en bloque' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);

    const d1 = await req('GET', `/devices/${bulkCtx.d1}`, undefined, ctx.adminToken);
    const d2 = await req('GET', `/devices/${bulkCtx.d2}`, undefined, ctx.adminToken);
    assert.ok(d1.data.decommissioned_at);
    assert.ok(d2.data.decommissioned_at);

    const logs = await req('GET', '/audit-logs?action=DEVICES_BULK_DECOMMISSIONED&limit=50', undefined, ctx.adminToken);
    const row = logs.data.items.find((i: any) => {
      const meta = typeof i.metadata === 'string' ? JSON.parse(i.metadata) : i.metadata;
      return meta?.device_ids?.includes(bulkCtx.d1) && meta?.device_ids?.includes(bulkCtx.d2);
    });
    assert.ok(row, 'debe existir una única fila de audit con ambos ids');
  });

  test('repetir sobre los mismos ids → ambos vuelven skipped (already_decommissioned)', async () => {
    const res = await req('POST', '/devices/bulk/decommission', { ids: [bulkCtx.d1, bulkCtx.d2], reason: 'De nuevo' }, ctx.adminToken);
    assert.equal(res.data.count, 0);
    assert.ok(res.data.skipped.every((s: any) => s.reason === 'already_decommissioned'));
  });

  test('sin reason → 400 (schema)', async () => {
    const { status } = await req('POST', '/devices/bulk/decommission', { ids: [bulkCtx.d1] }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('más de 500 ids → 400 (schema)', async () => {
    const ids = Array.from({ length: 501 }, () => crypto.randomUUID());
    const { status } = await req('POST', '/devices/bulk/decommission', { ids, reason: 'x' }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('reactivar en bloque', async () => {
    const res = await req('POST', '/devices/bulk/recommission', { ids: [bulkCtx.d1, bulkCtx.d2] }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);

    const d1 = await req('GET', `/devices/${bulkCtx.d1}`, undefined, ctx.adminToken);
    assert.equal(d1.data.decommissioned_at, null);
  });

  test('reactivar un equipo que no está de baja → skipped (not_decommissioned)', async () => {
    const res = await req('POST', '/devices/bulk/recommission', { ids: [bulkCtx.d1] }, ctx.adminToken);
    assert.equal(res.data.count, 0);
    assert.equal(res.data.skipped[0].reason, 'not_decommissioned');
  });
});

describe('Acciones en bloque — mover en bloque', () => {
  const bulkCtx = { d1: '', d2: '', collisionSerial: '' };

  test('setup: 2 equipos en agente A1 (cliente A), uno con serial que ya existe en el cliente B', async () => {
    bulkCtx.collisionSerial = `SN-BULK-MOVE-COLLIDE-${ts}`;
    const points = [`SN-BULK-MOVE-1-${ts}`, bulkCtx.collisionSerial];
    for (const [i, serial] of points.entries()) {
      const sync = await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.30.2.${i + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, offline: false }],
      }, ctx.agentA1Token);
      assert.equal(sync.status, 200);
    }
    // El mismo serial YA existe en el cliente B (vía agentBToken) — provoca colisión al mover a B.
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: bulkCtx.collisionSerial, ip: '10.30.3.1', brand: 'hp',
        time: new Date().toISOString(), total_pages: 5, offline: false }],
    }, ctx.agentBToken);

    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    bulkCtx.d1 = devices.data.find((d: any) => d.serial_number === points[0]).id;
    bulkCtx.d2 = devices.data.find((d: any) => d.serial_number === bulkCtx.collisionSerial).id;
  });

  test('mover al mismo cliente (otro monitor) — ambos aplican', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1, bulkCtx.d2], agentId: ctx.agentA2Id, reason: 'Reasignación en bloque' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);
  });

  test('mover de nuevo al mismo agente → skipped (same_agent)', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1], agentId: ctx.agentA2Id, reason: 'Otra vez' }, ctx.adminToken);
    assert.equal(res.data.count, 0);
    assert.equal(res.data.skipped[0].reason, 'same_agent');
  });

  test('mover a otro cliente sin confirmClientChange → skipped (confirm_required), no aborta todo el lote', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1], agentId: ctx.agentBId, reason: 'Cambio de cliente' }, ctx.adminToken);
    assert.equal(res.status, 200, 'a diferencia del endpoint single, el bulk nunca aborta con 400 por esto');
    assert.equal(res.data.count, 0);
    assert.equal(res.data.skipped[0].reason, 'confirm_required');
  });

  test('mover a otro cliente CON confirmClientChange, con colisión de serial en el destino → uno aplica, el otro queda skipped', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1, bulkCtx.d2], agentId: ctx.agentBId, reason: 'Cambio confirmado', confirmClientChange: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 1);
    assert.ok(res.data.applied.includes(bulkCtx.d1));
    const skip = res.data.skipped.find((s: any) => s.id === bulkCtx.d2);
    assert.equal(skip?.reason, 'collision');
  });
});

describe('Acciones en bloque — estado de monitoreo', () => {
  test('cambia el estado de 2 equipos de una', async () => {
    const points = [`SN-BULK-MON-1-${ts}`, `SN-BULK-MON-2-${ts}`];
    for (const [i, serial] of points.entries()) {
      await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.30.4.${i + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, offline: false }],
      }, ctx.agentA1Token);
    }
    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    const ids = points.map((s) => devices.data.find((d: any) => d.serial_number === s).id);

    const res = await req('POST', '/devices/bulk/monitor-state', { ids, state: 'supplies_only' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);

    for (const id of ids) {
      const d = await req('GET', `/devices/${id}`, undefined, ctx.adminToken);
      assert.equal(d.data.monitor_state, 'supplies_only');
    }
  });

  test('state inválido → 400 (schema)', async () => {
    const points = [`SN-BULK-MON-INVALID-${ts}`];
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: points[0], ip: '10.30.4.9', brand: 'hp',
        time: new Date().toISOString(), total_pages: 10, offline: false }],
    }, ctx.agentA1Token);
    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    const id = devices.data.find((d: any) => d.serial_number === points[0]).id;

    const { status } = await req('POST', '/devices/bulk/monitor-state', { ids: [id], state: 'no-existe' }, ctx.adminToken);
    assert.equal(status, 400);
  });
});
