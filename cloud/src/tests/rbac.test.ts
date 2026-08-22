// RBAC por cliente — Tests de integración — requieren el backend corriendo en
// localhost:3000 (mismo criterio que e2e.test.ts).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/rbac.test.ts
//
// IMPORTANTE: usar `--test-concurrency=1` cuando se corre junto a e2e.test.ts (ver
// `npm test` en package.json) — ambos archivos crean datos contra la MISMA base, y
// e2e.test.ts asume conteos que una corrida concurrente puede romper.
//
// Este archivo NO reusa `db/knexfile.ts` para su conexión directa a Postgres (usada
// sólo en el bloque "Restricciones a nivel de base" al final): ese knexfile apunta a
// `DB_HOST=postgres`, el hostname de la red interna de Docker pensado para correr
// DENTRO del contenedor de la API. Este test corre en el host, así que se conecta al
// puerto mapeado (5434 por defecto en docker-compose.yml).

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knexLib from 'knex';
import { hashPassword } from '../api/utils/password';

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

const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.RBAC_TEST_DB_HOST || 'localhost',
    port: Number(process.env.RBAC_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});

after(async () => {
  await rawDb.destroy().catch(() => {});
});

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

describe('RBAC — /devices', () => {
  test('/devices lista sólo dispositivos del cliente propio', async () => {
    const { status, data } = await req('GET', '/devices', undefined, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(data.every((d: any) => d.client_id === rbac.clientAId));
    assert.ok(!data.some((d: any) => d.serial_number === rbac.deviceBSerial));
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

describe('RBAC — mutaciones denegadas para client_viewer', () => {
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

  test('DELETE /devices/offline → 403', async () => {
    const { status } = await req('DELETE', `/devices/offline?agent_id=${rbac.agentAId}`, {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /portal/users/:id → 403 (ni siquiera sobre su propio usuario: la ruta está bloqueada por completo)', async () => {
    const { status } = await req('PUT', `/portal/users/${rbac.viewerUserId}`, {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /portal/agents/version → 403', async () => {
    const { status } = await req('POST', '/portal/agents/version', { version: '9.9.9', url: 'http://x', hash: 'abc' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /feedback → 200 (la única mutación permitida: reportar un bug no requiere privilegio)', async () => {
    const { status, data } = await req('POST', '/feedback', {
      type: 'bug', title: 'Prueba RBAC', description: 'Descripción de prueba para el test de RBAC por cliente.',
    }, rbac.viewerToken);
    assert.equal(status, 200);
    assert.ok(data.feedback?.id);
  });
});

describe('RBAC — usuario desactivado', () => {
  test('un client_viewer desactivado recibe 401 (no 403) en cualquier ruta', async () => {
    const deactivate = await req('PUT', `/portal/users/${rbac.viewerUserId}`, { active: false }, rbac.adminToken);
    assert.equal(deactivate.status, 200);

    const { status } = await req('GET', '/portal/me', undefined, rbac.viewerToken);
    assert.equal(status, 401);

    // Reactivar: no queda ningún otro test dependiendo de este usuario después.
    const reactivate = await req('PUT', `/portal/users/${rbac.viewerUserId}`, { active: true }, rbac.adminToken);
    assert.equal(reactivate.status, 200);
  });
});

describe('RBAC — admin no sufre regresión', () => {
  test('admin sigue viendo todos los clientes y el dashboard global', async () => {
    const clients = await req('GET', '/clients', undefined, rbac.adminToken);
    assert.equal(clients.status, 200);
    assert.ok(clients.data.length >= 2, 'Debe ver al menos los clientes A y B creados en este archivo');

    const dashboard = await req('GET', '/dashboard', undefined, rbac.adminToken);
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.data.stats.clients >= 2);
  });
  // `operator` comparte el mismo camino sin scoping que `admin` en rolePolicy.ts
  // (ambos son `scoped:false`); no se agrega un usuario operator dedicado acá — los
  // únicos chequeos que distinguen admin de operator (gestión de usuarios/versión de
  // agente) son preexistentes a este cambio y no los toca el RBAC por cliente.
});

// ─── Restricciones a nivel de base: el CHECK cierra el eje "rol" incluso si algo
// más allá de la API intentara escribir directo a la tabla ──────────────────────

describe('RBAC — restricciones a nivel de base (defensa en profundidad)', () => {
  test('un rol fuera de admin/operator/client_viewer es rechazado por la CHECK (23514)', async () => {
    await assert.rejects(
      rawDb('users').insert({
        id: rawDb.raw('gen_random_uuid()'),
        username: `rbac_bogus_role_${ts}`,
        password_hash: hashPassword('irrelevante'),
        role: 'auditor',
      }),
      (err: any) => {
        assert.equal(err.code, '23514');
        return true;
      },
      // Nota: esto es lo que hace IMPOSIBLE reproducir por SQL directo el escenario
      // "rol desconocido que llega a portalAuth" que el `policyFor()` de
      // rolePolicy.ts también deniega — hay dos capas independientes (CHECK de base
      // + registro de políticas en la app), y esta prueba confirma la primera.
    );
  });

  test('un client_viewer sin client_id es rechazado por la CHECK (23514)', async () => {
    await assert.rejects(
      rawDb('users').insert({
        id: rawDb.raw('gen_random_uuid()'),
        username: `rbac_orphan_viewer_${ts}`,
        password_hash: hashPassword('irrelevante'),
        role: 'client_viewer',
        client_id: null,
      }),
      (err: any) => {
        assert.equal(err.code, '23514');
        return true;
      },
    );
  });
});
