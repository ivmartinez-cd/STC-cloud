// Detección de consumible no original (Fase 10 del gap analysis vs HP SDS) —
// Tests de integración, mismo criterio que monitorState.test.ts/alerts.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/supplyOrigin.test.ts

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

function sync(agentToken: string, serial: string, ip: string, extra: Record<string, unknown> = {}) {
  return req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: serial, ip, brand: 'hp',
      time: new Date().toISOString(), total_pages: 10, toner_black: 80, offline: false,
      ...extra,
    }],
  }, agentToken);
}

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', agentId: '', agentToken: '' };

describe('supply_origin — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `SupplyOrigin Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente SupplyOrigin ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-SUPPLYORIGIN-${ts}` });
    ctx.agentToken = activate.data.token;
  });
});

describe('supply_origin explícito del agente (1.1.0+)', () => {
  const serial = `SN-ORIGIN-EXPLICIT-${ts}`;
  let deviceId = '';

  test('un equipo nuevo con supply_origin=non_genuine en la primera lectura ya alerta', async () => {
    const s = await sync(ctx.agentToken, serial, '192.168.243.10', { supply_origin: 'non_genuine' });
    assert.equal(s.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === serial);
    assert.ok(device);
    deviceId = device.id;
    assert.equal(device.supply_origin, 'non_genuine');
    assert.ok(device.supply_origin_at);

    const alerts = await pollUntil(
      () => req('GET', `/alerts?device_id=${deviceId}&type=supply_non_genuine&resolved=false`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );
    assert.equal(alerts.data.length, 1);
  });

  test('transición a genuine resuelve la alerta', async () => {
    const s = await sync(ctx.agentToken, serial, '192.168.243.10', { supply_origin: 'genuine' });
    assert.equal(s.status, 200);

    const device = await pollUntil(
      () => req('GET', `/devices/${deviceId}`, undefined, ctx.adminToken),
      (r) => r.data.supply_origin === 'genuine',
    );
    assert.equal(device.data.supply_origin, 'genuine');

    const alerts = await pollUntil(
      () => req('GET', `/alerts?device_id=${deviceId}&type=supply_non_genuine`, undefined, ctx.adminToken),
      (r) => r.data.some((a: any) => a.resolved === true),
    );
    assert.ok(alerts.data.find((a: any) => a.resolved === true));
  });

  test('sync sin supply_origin (ausente en el body) no pisa el valor persistido', async () => {
    const s = await sync(ctx.agentToken, serial, '192.168.243.10', {});
    assert.equal(s.status, 200);
    const device = await req('GET', `/devices/${deviceId}`, undefined, ctx.adminToken);
    assert.equal(device.data.supply_origin, 'genuine', 'sin señal no debe resetear a null lo ya sabido');
  });
});

describe('supply_origin derivado server-side (agente <1.1.0, sin el campo)', () => {
  test('un agente viejo que sólo manda supplies_details con origin embebido igual persiste supply_origin', async () => {
    const serial = `SN-ORIGIN-DERIVED-${ts}`;
    const s = await sync(ctx.agentToken, serial, '192.168.243.20', {
      supplies_details: { toners: { black: { percentage: 80, origin: 'non_genuine' } } },
    });
    assert.equal(s.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === serial);
    assert.ok(device);
    assert.equal(device.supply_origin, 'non_genuine', 'debe derivarse del jsonb aunque el campo plano no venga');
  });
});

describe('asset_number_reported se llena desde supplies_details.device.assetNumber', () => {
  test('el número de activo reportado por el EWS se persiste', async () => {
    const serial = `SN-ASSETNUM-${ts}`;
    const s = await sync(ctx.agentToken, serial, '192.168.243.30', {
      supplies_details: { device: { assetNumber: 'ACT-99887' } },
    });
    assert.equal(s.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === serial);
    assert.ok(device);
    assert.equal(device.asset_number_reported, 'ACT-99887');
    assert.equal(device.asset_number, 'ACT-99887', 'sin override manual, el efectivo = reportado');
  });

  test('un override manual del portal sobrevive a un sync posterior', async () => {
    const serial = `SN-ASSETNUM-OVERRIDE-${ts}`;
    await sync(ctx.agentToken, serial, '192.168.243.31', { supplies_details: { device: { assetNumber: 'ACT-ORIGINAL' } } });
    const devices1 = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device1 = devices1.data.find((d: any) => d.serial_number === serial);

    const put = await req('PUT', `/devices/${device1.id}`, { asset_number: 'ACT-MANUAL-OVERRIDE' }, ctx.adminToken);
    assert.equal(put.status, 200);

    await sync(ctx.agentToken, serial, '192.168.243.31', { supplies_details: { device: { assetNumber: 'ACT-ORIGINAL-2' } } });
    const device2 = await req('GET', `/devices/${device1.id}`, undefined, ctx.adminToken);
    assert.equal(device2.data.asset_number, 'ACT-MANUAL-OVERRIDE', 'el override manual no debe perderse por un sync posterior');
    assert.equal(device2.data.asset_number_reported, 'ACT-ORIGINAL-2', 'el reportado sí sigue actualizándose');
  });
});
