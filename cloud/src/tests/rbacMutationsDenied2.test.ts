// RBAC por cliente — mutaciones denegadas para client_viewer, parte 2: costes
// (Fase 4.5), correo (Fase 4.4), plantillas (Fase 4.3), pedidos de consumibles
// (Fase 4.2), incidentes (Fase 11), misceláneos, y cierre/reapertura de
// reportes; más usuario desactivado, admin sin regresión, y restricciones a
// nivel de base. Separado de rbac.test.ts (deuda de sizes-baseline,
// 2026-08-26) sólo por tamaño de archivo; fixture propia porque corre en su
// propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/rbacMutationsDenied2.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
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

const ts = Date.now();
const rbac = {
  adminToken: '',
  clientAId: '', clientAName: `RBAC Mut2 Client A ${ts}`,
  agentAId: '', agentAKey: '', agentAToken: '',
  deviceASerial: `SN-RBAC-M2-A-${ts}`, deviceAId: '',
  viewerUsername: `rbac_m2_viewer_${ts}`,
  viewerPassword: 'RbacViewer123',
  viewerUserId: '',
  viewerToken: '',
};

describe('RBAC mutaciones (parte 2) — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + dispositivo + client_viewer', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    rbac.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: rbac.clientAName }, rbac.adminToken);
    assert.equal(client.status, 200);
    rbac.clientAId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: rbac.clientAId, name: 'RBAC Mut2 Agent A' }, rbac.adminToken);
    assert.equal(agent.status, 200);
    rbac.agentAId = agent.data.agentId;
    rbac.agentAKey = agent.data.key;

    const activate = await req('POST', '/agents/activate', { key: rbac.agentAKey, hardwareId: `RBAC-M2-HW-A-${ts}` });
    assert.equal(activate.status, 200);
    rbac.agentAToken = activate.data.token;

    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.203.10', mac: null, serial: rbac.deviceASerial, brand: 'hp', model: 'HP LaserJet A', name: 'RBAC Mut2 Device A' }],
    }, rbac.agentAToken);
    assert.equal(registered.status, 200);
    const devices = await req('GET', `/clients/${rbac.clientAId}/devices`, undefined, rbac.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === rbac.deviceASerial);
    assert.ok(device, 'Dispositivo A debe existir');
    rbac.deviceAId = device.id;

    const viewerCreate = await req('POST', '/portal/users', {
      username: rbac.viewerUsername, password: rbac.viewerPassword, role: 'client_viewer', client_id: rbac.clientAId,
    }, rbac.adminToken);
    assert.equal(viewerCreate.status, 200);
    rbac.viewerUserId = viewerCreate.data.id;
    const viewerLogin = await req('POST', '/portal/login', { username: rbac.viewerUsername, password: rbac.viewerPassword });
    assert.equal(viewerLogin.status, 200);
    rbac.viewerToken = viewerLogin.data.token;
  });
});

describe('RBAC — mutaciones denegadas para client_viewer (parte 2)', () => {
  // Fase 4.5 del gap analysis vs HP SDS — costes por equipo: datos comerciales.
  test('GET /devices/:id/costs → 403', async () => {
    const { status } = await req('GET', `/devices/${rbac.deviceAId}/costs`, undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /devices/:id/costs → 403', async () => {
    const { status } = await req('PUT', `/devices/${rbac.deviceAId}/costs`, { mono_page_cost: 0.01 }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 4.4 del gap analysis vs HP SDS — auditoría de correo: admin puro.
  test('GET /email-log → 403', async () => {
    const { status } = await req('GET', '/email-log', undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 4.3 del gap analysis vs HP SDS — plantillas de mensajes: admin puro.
  test('GET /message-templates → 403', async () => {
    const { status } = await req('GET', '/message-templates', undefined, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 4.2 del gap analysis vs HP SDS — pedidos de consumibles: los GET
  // están en CLIENT_VIEWER_ROUTES (probado en supplyRequests.test.ts), las
  // mutaciones y la config quedan deny-by-default.
  test('POST /supply-requests → 403', async () => {
    const { status } = await req('POST', '/supply-requests', { client_id: rbac.clientAId, supply_kind: 'toner' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /clients/:id/supply-request-settings → 403', async () => {
    const { status } = await req('PUT', `/clients/${rbac.clientAId}/supply-request-settings`, { enabled: true, threshold_pct: 10 }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  // Fase 11 del gap analysis vs HP SDS — módulo de incidentes. Los 3 GET
  // (list/stats/detail) SÍ están en CLIENT_VIEWER_ROUTES (probado aparte en
  // incidents.test.ts); el resto es gestión de servicio, deny-by-default.
  test('POST /incidents → 403', async () => {
    const { status } = await req('POST', '/incidents', { client_id: rbac.clientAId, class: 'jam' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PATCH /incidents/:id → 403', async () => {
    const { status } = await req('PATCH', '/incidents/00000000-0000-0000-0000-000000000000', { title: 'x' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /incidents/:id/close → 403', async () => {
    const { status } = await req('POST', '/incidents/00000000-0000-0000-0000-000000000000/close', {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /incidents/:id/reopen → 403', async () => {
    const { status } = await req('POST', '/incidents/00000000-0000-0000-0000-000000000000/reopen', {}, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /incidents/:id/comments → 403', async () => {
    const { status } = await req('POST', '/incidents/00000000-0000-0000-0000-000000000000/comments', { body: 'x' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /incidents/:id/alerts → 403', async () => {
    const { status } = await req('POST', '/incidents/00000000-0000-0000-0000-000000000000/alerts', { alert_id: 1 }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /clients/:id/incident-rules → 403', async () => {
    const { status } = await req('PUT', `/clients/${rbac.clientAId}/incident-rules`, { rules: [{ class: 'jam', enabled: true }] }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('GET /devices/duplicates → 403 (herramienta de operaciones, no de sólo lectura)', async () => {
    const { status } = await req('GET', `/devices/duplicates?client_id=${rbac.clientAId}`, undefined, rbac.viewerToken);
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

  test('PUT /alerts/:id → 403 (ack/resolve queda para admin/operator, no para client_viewer)', async () => {
    const { status } = await req('PUT', '/alerts/1', { acknowledged: true }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('PUT /clients/:id → 403', async () => {
    const { status } = await req('PUT', `/clients/${rbac.clientAId}`, { notification_email: 'x@x.com' }, rbac.viewerToken);
    assert.equal(status, 403);
  });

  test('POST /clients/:id/reports/close → 403, y no se crea ningún cierre (verificado como admin)', async () => {
    const period = `2026-01`;
    const denied = await req('POST', `/clients/${rbac.clientAId}/reports/close`, { period }, rbac.viewerToken);
    assert.equal(denied.status, 403);
    const check = await req('GET', `/clients/${rbac.clientAId}/reports`, undefined, rbac.adminToken);
    assert.ok(!check.data.some((c: any) => c.period?.startsWith(period)), 'No debe existir un cierre creado por el viewer');
  });

  test('POST /clients/:id/reports/:closureId/reopen → 403', async () => {
    const { status } = await req('POST', `/clients/${rbac.clientAId}/reports/00000000-0000-0000-0000-000000000000/reopen`, {}, rbac.viewerToken);
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
    assert.ok(clients.data.length >= 1, 'Debe ver al menos el cliente A creado en este archivo');

    const dashboard = await req('GET', '/dashboard', undefined, rbac.adminToken);
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.data.stats.clients >= 1);
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
