// RBAC por cliente — fixtures, /portal/me+/clients, /agents y reportes
// (lectura). Tests de integración — requieren el backend corriendo en
// localhost:3000 (mismo criterio que e2e.test.ts). El resto de RBAC
// (deuda de sizes-baseline, 2026-08-26) pasó a rbacDevicesSearch.test.ts,
// rbacMutationsDenied1.test.ts y rbacMutationsDenied2.test.ts, cada uno con
// su propia fixture.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/rbac.test.ts
//
// IMPORTANTE: usar `--test-concurrency=1` cuando se corre junto a e2e.test.ts (ver
// `npm test` en package.json) — ambos archivos crean datos contra la MISMA base, y
// e2e.test.ts asume conteos que una corrida concurrente puede romper.

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

/**
 * `/agents/activate` tiene rate-limit 5/min (authRoutes.ts). e2e.test.ts ya consume
 * 4 de esas 5 llamadas en la misma ventana cuando corre justo antes que este archivo
 * (ver `npm test`, que corre ambos con `--test-concurrency=1`) — con las 2 llamadas
 * de este archivo (agente A + agente B) se pasa del límite y la 2da recibe 429. En
 * vez de espaciar manualmente las llamadas (frágil: cualquier test nuevo en
 * e2e.test.ts corre el riesgo de volver a romper el margen), se reintenta una vez
 * esperando lo que indique `Retry-After`.
 */
async function activateAgent(key: string, hardwareId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/agents/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hardwareId }),
    });
    if (res.status === 429 && attempt === 0) {
      const retryAfterSec = Number(res.headers.get('retry-after')) || 61;
      console.log(`[rbac.test] /agents/activate rate-limited, esperando ${retryAfterSec}s...`);
      await new Promise((resolve) => setTimeout(resolve, (retryAfterSec + 1) * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as any };
  }
  throw new Error('/agents/activate: rate limit persistente tras reintento');
}

// ─── Estado compartido entre tests (ejecución secuencial, mismo criterio que
// e2e.test.ts) ─────────────────────────────────────────────────────────────────

const ts = Date.now();
const rbac = {
  adminToken: '',
  clientAId: '', clientAName: `RBAC Client A ${ts}`,
  clientBId: '', clientBName: `RBAC Client B ${ts}`,
  agentAId: '', agentAKey: '', agentAToken: '',
  agentBId: '', agentBKey: '', agentBToken: '',
  deviceASerial: `SN-RBAC-A-${ts}`, deviceAId: '',
  deviceBSerial: `SN-RBAC-B-${ts}`, deviceBId: '',
  viewerUsername: `rbac_viewer_${ts}`,
  viewerPassword: 'RbacViewer123',
  viewerUserId: '',
  viewerToken: '',
};

// ─── Fixtures: dos clientes, un agente + un dispositivo cada uno, un
// client_viewer atado al cliente A ─────────────────────────────────────────────

describe('RBAC — fixtures', () => {
  test('Setup: login admin', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(status, 200);
    rbac.adminToken = data.token;
  });

  test('Setup: crear clientes A y B', async () => {
    const a = await req('POST', '/clients', { name: rbac.clientAName }, rbac.adminToken);
    assert.equal(a.status, 200);
    rbac.clientAId = a.data.id;

    const b = await req('POST', '/clients', { name: rbac.clientBName }, rbac.adminToken);
    assert.equal(b.status, 200);
    rbac.clientBId = b.data.id;
  });

  test('Setup: crear + activar agente A (cliente A)', async () => {
    const created = await req('POST', '/agents', { clientId: rbac.clientAId, name: 'RBAC Agent A' }, rbac.adminToken);
    assert.equal(created.status, 200);
    rbac.agentAId = created.data.agentId;
    rbac.agentAKey = created.data.key;

    const activated = await activateAgent(rbac.agentAKey, `RBAC-HW-A-${ts}`);
    assert.equal(activated.status, 200);
    rbac.agentAToken = activated.data.token;
  });

  test('Setup: crear + activar agente B (cliente B)', async () => {
    const created = await req('POST', '/agents', { clientId: rbac.clientBId, name: 'RBAC Agent B' }, rbac.adminToken);
    assert.equal(created.status, 200);
    rbac.agentBId = created.data.agentId;
    rbac.agentBKey = created.data.key;

    const activated = await activateAgent(rbac.agentBKey, `RBAC-HW-B-${ts}`);
    assert.equal(activated.status, 200);
    rbac.agentBToken = activated.data.token;
  });

  test('Setup: registrar + sincronizar dispositivo A', async () => {
    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.200.10', mac: null, serial: rbac.deviceASerial, brand: 'hp', model: 'HP LaserJet A', name: 'RBAC Device A' }],
    }, rbac.agentAToken);
    assert.equal(registered.status, 200);

    const synced = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: rbac.deviceASerial, ip: '192.168.200.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 500, mono_pages: 400, color_pages: 100, offline: false,
      }],
    }, rbac.agentAToken);
    assert.equal(synced.status, 200);

    const devices = await req('GET', `/clients/${rbac.clientAId}/devices`, undefined, rbac.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === rbac.deviceASerial);
    assert.ok(device, 'Dispositivo A debe existir');
    rbac.deviceAId = device.id;
  });

  test('Setup: registrar + sincronizar dispositivo B (con reset de contador, para probar fuga de alertas)', async () => {
    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.200.20', mac: null, serial: rbac.deviceBSerial, brand: 'hp', model: 'HP LaserJet B', name: 'RBAC Device B' }],
    }, rbac.agentBToken);
    assert.equal(registered.status, 200);

    const base = Date.now();
    for (const [i, totalPages] of [100, 50].entries()) {
      const synced = await req('POST', '/devices/sync', {
        readings: [{
          reading_id: crypto.randomUUID(), device_id: rbac.deviceBSerial, ip: '192.168.200.20', brand: 'hp',
          time: new Date(base + i * 1000).toISOString(), total_pages: totalPages, offline: false,
        }],
      }, rbac.agentBToken);
      assert.equal(synced.status, 200);
    }

    const devices = await req('GET', `/clients/${rbac.clientBId}/devices`, undefined, rbac.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === rbac.deviceBSerial);
    assert.ok(device, 'Dispositivo B debe existir');
    rbac.deviceBId = device.id;
  });

  test('Setup: crear usuario client_viewer atado al cliente A', async () => {
    const { status, data } = await req('POST', '/portal/users', {
      username: rbac.viewerUsername,
      password: rbac.viewerPassword,
      role: 'client_viewer',
      client_id: rbac.clientAId,
    }, rbac.adminToken);
    assert.equal(status, 200);
    assert.equal(data.role, 'client_viewer');
    assert.equal(data.client_id, rbac.clientAId);
    rbac.viewerUserId = data.id;
  });

  test('Setup: login como client_viewer', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: rbac.viewerUsername, password: rbac.viewerPassword });
    assert.equal(status, 200);
    rbac.viewerToken = data.token;
  });
});

// ─── Identidad y scoping de lecturas ───────────────────────────────────────────

describe('RBAC — /portal/me y /clients', () => {
  test('/portal/me devuelve role=client_viewer y el clientId correcto', async () => {
    const { status, data } = await req('GET', '/portal/me', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.role, 'client_viewer');
    assert.equal(data.clientId, rbac.clientAId);
  });

  test('/clients devuelve sólo el cliente propio', async () => {
    const { status, data } = await req('GET', '/clients', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.length, 1, 'Un client_viewer sólo debe ver su propio cliente');
    assert.equal(data[0].id, rbac.clientAId);
  });

  test('/clients/:id de OTRO cliente → 404 (no 403: no debe revelar si existe)', async () => {
    const r1 = await req('GET', `/clients/${rbac.clientBId}`, undefined, rbac.viewerToken);
    assert.equal(r1.status, 404);
    const r2 = await req('GET', `/clients/${rbac.clientBId}/monitors`, undefined, rbac.viewerToken);
    assert.equal(r2.status, 404);
    const r3 = await req('GET', `/clients/${rbac.clientBId}/usage`, undefined, rbac.viewerToken);
    assert.equal(r3.status, 404);
    const r4 = await req('GET', `/clients/${rbac.clientBId}/devices`, undefined, rbac.viewerToken);
    assert.equal(r4.status, 404);
  });

  test('/clients/:id del propio cliente → 200', async () => {
    const { status, data } = await req('GET', `/clients/${rbac.clientAId}`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.id, rbac.clientAId);
  });

  // Handoff hifi "Clientes" (25/08/2026) — listado paginado/filtrado y tira de
  // métricas nuevos: el scope de un client_viewer se resuelve igual que en
  // /clients (getScope), sin `:id` en la URL así que no pasa por
  // clientIdParamMatchesScope — hay que verificar la restricción a mano.
  test('/clients/directory: un client_viewer sólo ve su propio cliente', async () => {
    const { status, data } = await req('GET', '/clients/directory', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.total, 1, 'Un client_viewer sólo debe ver su propio cliente');
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].id, rbac.clientAId);
  });

  test('/clients/summary: un client_viewer sólo ve métricas de su propio cliente', async () => {
    const { status, data } = await req('GET', '/clients/summary', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.clients_total, 1, 'Un client_viewer sólo debe contar su propio cliente');
  });
});

describe('RBAC — /agents', () => {
  test('/agents lista sólo agentes del cliente propio', async () => {
    const { status, data } = await req('GET', '/agents', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(data.every((a: any) => a.client_id === rbac.clientAId), 'No debe aparecer ningún agente de otro cliente');
    assert.ok(data.some((a: any) => a.id === rbac.agentAId), 'El propio agente debe aparecer');
    assert.ok(!data.some((a: any) => a.id === rbac.agentBId), 'El agente de otro cliente no debe aparecer');
  });

  test('/agents/:id de OTRO cliente → 404 (regresión: antes era 200 con {error})', async () => {
    const { status, data } = await req('GET', `/agents/${rbac.agentBId}`, undefined, rbac.viewerToken);
    assert.equal(status, 404);
    assert.notEqual(data.error, undefined);
  });

  test('/agents/:id propio → 200, sin secretos ni config', async () => {
    const { status, data } = await req('GET', `/agents/${rbac.agentAId}`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.id, rbac.agentAId);
    for (const field of ['activation_key', 'jwt_secret', 'refresh_token_hash', 'snmp_community', 'ip_ranges', 'config']) {
      assert.equal(data[field], undefined, `El campo "${field}" no debe exponerse a un client_viewer`);
    }
  });

  test('/agents/:id/devices de OTRO cliente → 404', async () => {
    const { status } = await req('GET', `/agents/${rbac.agentBId}/devices`, undefined, rbac.viewerToken);
    assert.equal(status, 404);
  });

  test('/agents/:id/devices propio → 200, sólo el dispositivo propio', async () => {
    const { status, data } = await req('GET', `/agents/${rbac.agentAId}/devices`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(data.some((d: any) => d.serial_number === rbac.deviceASerial));
    assert.ok(!data.some((d: any) => d.serial_number === rbac.deviceBSerial));
  });
});

describe('RBAC — reportes (lectura permitida, cierre denegado)', () => {
  test('/clients/:id/reports (propio) → 200', async () => {
    const { status, data } = await req('GET', `/clients/${rbac.clientAId}/reports`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
  });

  test('/clients/:id/reports de OTRO cliente → 404', async () => {
    const { status } = await req('GET', `/clients/${rbac.clientBId}/reports`, undefined, rbac.viewerToken);
    assert.equal(status, 404);
  });
});
