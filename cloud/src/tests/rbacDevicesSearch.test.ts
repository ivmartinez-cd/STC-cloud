// RBAC por cliente — /devices, /dashboard+/alerts+/search, reportes (lectura),
// y lecturas denegadas para client_viewer. Separado de rbac.test.ts (deuda de
// sizes-baseline, 2026-08-26) sólo por tamaño de archivo; fixture propia (2
// clientes, 2 agentes, 2 dispositivos, 1 client_viewer) porque corre solo.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/rbacDevicesSearch.test.ts

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
      console.log(`[rbacDevicesSearch.test] /agents/activate rate-limited, esperando ${retryAfterSec}s...`);
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
  clientAId: '', clientAName: `RBAC DevSearch Client A ${ts}`,
  clientBId: '', clientBName: `RBAC DevSearch Client B ${ts}`,
  agentAId: '', agentAKey: '', agentAToken: '',
  agentBId: '', agentBKey: '', agentBToken: '',
  deviceASerial: `SN-RBAC-DS-A-${ts}`, deviceAId: '',
  deviceBSerial: `SN-RBAC-DS-B-${ts}`, deviceBId: '',
  viewerUsername: `rbac_ds_viewer_${ts}`,
  viewerPassword: 'RbacViewer123',
  viewerToken: '',
};

describe('RBAC devices/search — fixtures', () => {
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
    const created = await req('POST', '/agents', { clientId: rbac.clientAId, name: 'RBAC DevSearch Agent A' }, rbac.adminToken);
    assert.equal(created.status, 200);
    rbac.agentAId = created.data.agentId;
    rbac.agentAKey = created.data.key;

    const activated = await activateAgent(rbac.agentAKey, `RBAC-DS-HW-A-${ts}`);
    assert.equal(activated.status, 200);
    rbac.agentAToken = activated.data.token;
  });

  test('Setup: crear + activar agente B (cliente B)', async () => {
    const created = await req('POST', '/agents', { clientId: rbac.clientBId, name: 'RBAC DevSearch Agent B' }, rbac.adminToken);
    assert.equal(created.status, 200);
    rbac.agentBId = created.data.agentId;
    rbac.agentBKey = created.data.key;

    const activated = await activateAgent(rbac.agentBKey, `RBAC-DS-HW-B-${ts}`);
    assert.equal(activated.status, 200);
    rbac.agentBToken = activated.data.token;
  });

  test('Setup: registrar + sincronizar dispositivo A', async () => {
    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.201.10', mac: null, serial: rbac.deviceASerial, brand: 'hp', model: 'HP LaserJet A', name: 'RBAC DevSearch Device A' }],
    }, rbac.agentAToken);
    assert.equal(registered.status, 200);

    const synced = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: rbac.deviceASerial, ip: '192.168.201.10', brand: 'hp',
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
      devices: [{ ip: '192.168.201.20', mac: null, serial: rbac.deviceBSerial, brand: 'hp', model: 'HP LaserJet B', name: 'RBAC DevSearch Device B' }],
    }, rbac.agentBToken);
    assert.equal(registered.status, 200);

    const base = Date.now();
    for (const [i, totalPages] of [100, 50].entries()) {
      const synced = await req('POST', '/devices/sync', {
        readings: [{
          reading_id: crypto.randomUUID(), device_id: rbac.deviceBSerial, ip: '192.168.201.20', brand: 'hp',
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

    const login = await req('POST', '/portal/login', { username: rbac.viewerUsername, password: rbac.viewerPassword });
    assert.equal(login.status, 200);
    rbac.viewerToken = login.data.token;
  });
});

describe('RBAC — /devices', () => {
  test('/devices lista sólo dispositivos del cliente propio', async () => {
    const { status, data } = await req('GET', '/devices', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(data.items.every((d: any) => d.client_id === rbac.clientAId));
    assert.ok(!data.items.some((d: any) => d.serial_number === rbac.deviceBSerial));
  });

  test('/devices/:id de OTRO cliente por UUID → 404', async () => {
    const { status } = await req('GET', `/devices/${rbac.deviceBId}`, undefined, rbac.viewerToken);
    assert.equal(status, 404);
  });

  test('/devices/:id propio → 200', async () => {
    const { status, data } = await req('GET', `/devices/${rbac.deviceAId}`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.id, rbac.deviceAId);
  });

  test('/devices/:id/readings de OTRO cliente por UUID → 404 (no [])', async () => {
    const { status } = await req('GET', `/devices/${rbac.deviceBId}/readings`, undefined, rbac.viewerToken);
    assert.equal(status, 404);
  });

  test('/devices/:id/readings de OTRO cliente por SERIAL (alias) → 404 — el ownership sobrevive a la resolución', async () => {
    const { status } = await req('GET', `/devices/${rbac.deviceBSerial}/readings`, undefined, rbac.viewerToken);
    assert.equal(status, 404);
  });

  test('/devices/:id/readings con id no-UUID e inexistente → 404, NO 500 (regresión del bug 22P02)', async () => {
    const { status } = await req('GET', '/devices/esto-no-es-un-uuid-ni-existe/readings', undefined, rbac.viewerToken);
    assert.equal(status, 404);
  });

  test('/devices/:id/readings propio → 200 con lecturas', async () => {
    const { status, data } = await req('GET', `/devices/${rbac.deviceAId}/readings`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data) && data.length > 0);
  });
});

describe('RBAC — /dashboard, /alerts, /search', () => {
  test('/dashboard: stats.clients===1, topClients y offlineAgents no incluyen al otro cliente', async () => {
    const { status, data } = await req('GET', '/dashboard', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.stats.clients, 1);
    assert.ok((data.topClients as any[]).every((c) => c.id === rbac.clientAId));
    assert.ok((data.offlineAgents as any[]).every((a) => a.client_name === rbac.clientAName));
    assert.ok(data.systemHealth.lastClient === null || data.systemHealth.lastClient === rbac.clientAName);
  });

  test('/alerts: la alerta counter_reset del dispositivo B (otro cliente) no aparece', async () => {
    const { status, data } = await req('GET', '/alerts', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(!(data as any[]).some((a) => a.device_id === rbac.deviceBId), 'No debe verse una alerta de otro cliente');
  });

  test('/alerts?device_id=<de otro cliente> → []', async () => {
    const { status, data } = await req('GET', `/alerts?device_id=${rbac.deviceBId}`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });

  test('/alerts/classes: client_viewer puede leer el catálogo (necesario para renderizar su propio filtro)', async () => {
    const { status, data } = await req('GET', '/alerts/classes', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.classes.length, 14);
  });

  test('/alerts/summary: client_viewer sólo ve el conteo de SU cliente, nunca el del otro', async () => {
    const { status, data } = await req('GET', '/alerts/summary', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    const sumByClass = data.byClass.reduce((acc: number, r: any) => acc + r.count, 0);
    assert.equal(sumByClass, data.total, 'el desglose por clase debe cuadrar con el total scopeado');

    const asViewer = await req('GET', '/alerts/summary', undefined, rbac.viewerToken);
    const asAdmin = await req('GET', `/alerts/summary?client_id=${rbac.clientAId}`, undefined, rbac.adminToken);
    assert.equal(asViewer.data.total, asAdmin.data.total, 'el total del viewer debe coincidir con el del admin filtrado al mismo cliente');
  });

  test('/search por el serial del dispositivo B (otro cliente) → vacío para el viewer, no vacío para admin', async () => {
    const asViewer = await req('GET', `/search?q=${rbac.deviceBSerial}`, undefined, rbac.viewerToken);
    assert.equal(asViewer.status, 200);
    assert.equal(asViewer.data.devices.length, 0, 'El viewer no debe encontrar dispositivos de otro cliente');

    const asAdmin = await req('GET', `/search?q=${rbac.deviceBSerial}`, undefined, rbac.adminToken);
    assert.ok(asAdmin.data.devices.some((d: any) => d.serial_number === rbac.deviceBSerial),
      'El admin SÍ debe encontrarlo — esto prueba que hay scoping, no que la búsqueda esté rota (regresión del bug de OR sin agrupar)');
  });

  test('/search por el nombre del cliente B → clients:[] para el viewer', async () => {
    const { status, data } = await req('GET', `/search?q=${encodeURIComponent(rbac.clientBName)}`, undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.equal(data.clients.length, 0);
  });
});

describe('RBAC — lecturas denegadas para client_viewer', () => {
  test('/agents/:id/config → 403 (expone snmp_community e ip_ranges)', async () => {
    const { status } = await req('GET', `/agents/${rbac.agentAId}/config`, undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('/agents/:id/snmp-credentials → 403 (mismo criterio que /config)', async () => {
    const { status } = await req('GET', `/agents/${rbac.agentAId}/snmp-credentials`, undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('/agents/:id/logs y /logs/export → 403', async () => {
    const r1 = await req('GET', `/agents/${rbac.agentAId}/logs`, undefined, rbac.viewerToken);
    assert.equal(r1.status, 403);
    const r2 = await req('GET', `/agents/${rbac.agentAId}/logs/export`, undefined, rbac.viewerToken);
    assert.equal(r2.status, 403);
  });

  test('/portal/users → 403', async () => {
    const { status } = await req('GET', '/portal/users', undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('/feedback (listado) → 403', async () => {
    const { status } = await req('GET', '/feedback', undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });
});
