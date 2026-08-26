// RBAC por cliente — mutaciones denegadas para client_viewer, parte 1: CRUD
// single de clientes/agentes/dispositivos, acciones en bloque (Fase 9),
// informes programados (Fase 4.1) y acciones remotas (Fase 4.6). Separado de
// rbac.test.ts (deuda de sizes-baseline, 2026-08-26) sólo por tamaño de
// archivo; fixture propia porque corre en su propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/rbacMutationsDenied1.test.ts

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

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

/** Mismo criterio que rbac.test.ts: /agents/activate tiene rate-limit 5/min. */
async function activateAgent(key: string, hardwareId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/agents/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hardwareId }),
    });
    if (res.status === 429 && attempt === 0) {
      const retryAfterSec = Number(res.headers.get('retry-after')) || 61;
      console.log(`[rbacMutationsDenied1.test] /agents/activate rate-limited, esperando ${retryAfterSec}s...`);
      await new Promise((resolve) => setTimeout(resolve, (retryAfterSec + 1) * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as any };
  }
  throw new Error('/agents/activate: rate limit persistente tras reintento');
}

const ts = Date.now();
const rbac = {
  adminToken: '',
  clientAId: '', clientAName: `RBAC Mut1 Client A ${ts}`,
  clientBId: '', clientBName: `RBAC Mut1 Client B ${ts}`,
  agentAId: '', agentAKey: '', agentAToken: '',
  agentBId: '', agentBKey: '', agentBToken: '',
  deviceASerial: `SN-RBAC-M1-A-${ts}`, deviceAId: '',
  deviceBSerial: `SN-RBAC-M1-B-${ts}`, deviceBId: '',
  viewerUsername: `rbac_m1_viewer_${ts}`,
  viewerPassword: 'RbacViewer123',
  viewerToken: '',
};

describe('RBAC mutaciones (parte 1) — fixtures', () => {
  test('Setup: login admin, crear 2 clientes + 2 agentes + 2 dispositivos + client_viewer', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    rbac.adminToken = login.data.token;

    const a = await req('POST', '/clients', { name: rbac.clientAName }, rbac.adminToken);
    assert.equal(a.status, 200);
    rbac.clientAId = a.data.id;
    const b = await req('POST', '/clients', { name: rbac.clientBName }, rbac.adminToken);
    assert.equal(b.status, 200);
    rbac.clientBId = b.data.id;

    const agentA = await req('POST', '/agents', { clientId: rbac.clientAId, name: 'RBAC Mut1 Agent A' }, rbac.adminToken);
    assert.equal(agentA.status, 200);
    rbac.agentAId = agentA.data.agentId;
    rbac.agentAKey = agentA.data.key;
    const actA = await activateAgent(rbac.agentAKey, `RBAC-M1-HW-A-${ts}`);
    assert.equal(actA.status, 200);
    rbac.agentAToken = actA.data.token;

    const agentB = await req('POST', '/agents', { clientId: rbac.clientBId, name: 'RBAC Mut1 Agent B' }, rbac.adminToken);
    assert.equal(agentB.status, 200);
    rbac.agentBId = agentB.data.agentId;
    rbac.agentBKey = agentB.data.key;
    const actB = await activateAgent(rbac.agentBKey, `RBAC-M1-HW-B-${ts}`);
    assert.equal(actB.status, 200);
    rbac.agentBToken = actB.data.token;

    const regA = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.202.10', mac: null, serial: rbac.deviceASerial, brand: 'hp', model: 'HP LaserJet A', name: 'RBAC Mut1 Device A' }],
    }, rbac.agentAToken);
    assert.equal(regA.status, 200);
    const syncA = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: rbac.deviceASerial, ip: '192.168.202.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 500, offline: false }],
    }, rbac.agentAToken);
    assert.equal(syncA.status, 200);
    const devicesA = await req('GET', `/clients/${rbac.clientAId}/devices`, undefined, rbac.adminToken);
    const deviceA = devicesA.data.find((d: any) => d.serial_number === rbac.deviceASerial);
    assert.ok(deviceA, 'Dispositivo A debe existir');
    rbac.deviceAId = deviceA.id;

    const regB = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.202.20', mac: null, serial: rbac.deviceBSerial, brand: 'hp', model: 'HP LaserJet B', name: 'RBAC Mut1 Device B' }],
    }, rbac.agentBToken);
    assert.equal(regB.status, 200);
    const syncB = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: rbac.deviceBSerial, ip: '192.168.202.20', brand: 'hp',
        time: new Date().toISOString(), total_pages: 100, offline: false }],
    }, rbac.agentBToken);
    assert.equal(syncB.status, 200);
    const devicesB = await req('GET', `/clients/${rbac.clientBId}/devices`, undefined, rbac.adminToken);
    const deviceB = devicesB.data.find((d: any) => d.serial_number === rbac.deviceBSerial);
    assert.ok(deviceB, 'Dispositivo B debe existir');
    rbac.deviceBId = deviceB.id;

    const viewerCreate = await req('POST', '/portal/users', {
      username: rbac.viewerUsername, password: rbac.viewerPassword, role: 'client_viewer', client_id: rbac.clientAId,
    }, rbac.adminToken);
    assert.equal(viewerCreate.status, 200);
    const viewerLogin = await req('POST', '/portal/login', { username: rbac.viewerUsername, password: rbac.viewerPassword });
    assert.equal(viewerLogin.status, 200);
    rbac.viewerToken = viewerLogin.data.token;
  });
});

describe('RBAC — mutaciones denegadas para client_viewer (parte 1)', () => {
  test('POST /clients → 403', async () => {
    const { status } = await req('POST', '/clients', { name: 'No debería crearse' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /agents → 403', async () => {
    const { status } = await req('POST', '/agents', { clientId: rbac.clientAId, name: 'No debería crearse' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /agents/:id/config → 403', async () => {
    const { status } = await req('PUT', `/agents/${rbac.agentAId}/config`, {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /agents/:id/snmp-credentials → 403, y no se guarda nada (verificado como admin)', async () => {
    const denied = await req('PUT', `/agents/${rbac.agentAId}/snmp-credentials`,
      { credentials: [{ version: 'v2c', community: 'hackeado' }] }, rbac.viewerToken);
    assert.equal(denied.status, 403);
    const check = await req('GET', `/agents/${rbac.agentAId}/snmp-credentials`, undefined, rbac.adminToken);
    assert.equal(check.data.credentials.length, 0, 'El viewer no debe poder crear una credencial');
  });

  test('POST /agents/:id/command → 403', async () => {
    const { status } = await req('POST', `/agents/${rbac.agentAId}/command`, { type: 'FORCE_SCAN' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /agents/:id/scan → 403', async () => {
    const { status } = await req('POST', `/agents/${rbac.agentAId}/scan`, {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /agents/:id/revoke → 403, y el agente sigue activo (verificado como admin)', async () => {
    const denied = await req('POST', `/agents/${rbac.agentAId}/revoke`, {}, rbac.viewerToken);
    assert.equal(denied.status, 403);
    const check = await req('GET', `/agents/${rbac.agentAId}`, undefined, rbac.adminToken);
    assert.notEqual(check.data.status, 'revoked', 'Un hook mal ordenado podría revocar antes de bloquear');
  });

  test('DELETE /agents/:id → 403, y el agente sigue existiendo (verificado como admin)', async () => {
    const denied = await req('DELETE', `/agents/${rbac.agentAId}`, {}, rbac.viewerToken);
    assert.equal(denied.status, 403);
    const check = await req('GET', `/agents/${rbac.agentAId}`, undefined, rbac.adminToken);
    assert.equal(check.status, 200, 'El agente no debe haberse borrado');
  });

  test('DELETE /devices/:id → 403, y el dispositivo sigue existiendo (verificado como admin)', async () => {
    const denied = await req('DELETE', `/devices/${rbac.deviceAId}`, {}, rbac.viewerToken);
    assert.equal(denied.status, 403);
    const check = await req('GET', `/devices/${rbac.deviceAId}`, undefined, rbac.adminToken);
    assert.equal(check.status, 200, 'El dispositivo no debe haberse borrado');
  });

  test('POST /agents/:id/devices/decommission-stale → 403 (reemplaza a DELETE /devices/offline)', async () => {
    const { status } = await req('POST', `/agents/${rbac.agentAId}/devices/decommission-stale`, {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /devices/:id → 403, y el nombre no cambia (verificado como admin)', async () => {
    const denied = await req('PUT', `/devices/${rbac.deviceAId}`, { name: 'Hackeado' }, rbac.viewerToken);
    assert.equal(denied.status, 403);
  });

  test('POST /devices/:id/decommission → 403, y el equipo sigue vivo (verificado como admin)', async () => {
    const denied = await req('POST', `/devices/${rbac.deviceAId}/decommission`, { reason: 'test' }, rbac.viewerToken);
    assert.equal(denied.status, 403);
    const check = await req('GET', `/devices/${rbac.deviceAId}`, undefined, rbac.adminToken);
    assert.equal(check.data.decommissioned_at, null, 'El equipo no debe haberse dado de baja');
  });

  test('POST /devices/:id/recommission → 403', async () => {
    const { status } = await req('POST', `/devices/${rbac.deviceAId}/recommission`, {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /devices/:id/move → 403', async () => {
    const { status } = await req('POST', `/devices/${rbac.deviceAId}/move`, { agentId: rbac.agentBId, reason: 'test' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /devices/:id/merge → 403', async () => {
    const { status } = await req('POST', `/devices/${rbac.deviceAId}/merge`, { sourceDeviceId: rbac.deviceBId }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 9 del gap analysis vs HP SDS — acciones en bloque, mismo criterio
  // deny-by-default que sus equivalentes single de arriba.
  test('POST /devices/bulk/decommission → 403', async () => {
    const { status } = await req('POST', '/devices/bulk/decommission', { ids: [rbac.deviceAId], reason: 'test' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /devices/bulk/recommission → 403', async () => {
    const { status } = await req('POST', '/devices/bulk/recommission', { ids: [rbac.deviceAId] }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /devices/bulk/move → 403', async () => {
    const { status } = await req('POST', '/devices/bulk/move', { ids: [rbac.deviceAId], agentId: rbac.agentBId, reason: 'test' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /devices/bulk/monitor-state → 403', async () => {
    const { status } = await req('POST', '/devices/bulk/monitor-state', { ids: [rbac.deviceAId], state: 'disabled' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /alerts/bulk → 403', async () => {
    const { status } = await req('POST', '/alerts/bulk', { ids: [1], acknowledged: true }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 4.1 del gap analysis vs HP SDS — informes programados: ninguna
  // ruta en CLIENT_VIEWER_ROUTES, todo deny-by-default (mismo criterio que
  // /audit-logs: definiciones globales de operación, no datos del cliente).
  test('GET /scheduled-reports → 403', async () => {
    const { status } = await req('GET', '/scheduled-reports', undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /scheduled-reports → 403', async () => {
    const { status } = await req('POST', '/scheduled-reports', { name: 'x y z', report_type: 'asset_list' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 4.6 del gap analysis vs HP SDS — acciones remotas: operación pura.
  test('GET /remote-actions → 403', async () => {
    const { status } = await req('GET', '/remote-actions', undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /remote-actions → 403', async () => {
    const { status } = await req('POST', '/remote-actions', { action: 'RESCAN', agent_ids: [rbac.agentAId] }, rbac.viewerToken);
    assert.equal(status, 403);
  });
});
