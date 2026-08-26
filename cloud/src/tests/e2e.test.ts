// E2E Integration Tests — requieren el backend corriendo en localhost:3000
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/e2e.test.ts
//
// IMPORTANTE: Requiere que exista al menos un cliente en la BD.
// Crear uno con: npm run seed

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

// ─── Estado compartido entre tests (ejecución secuencial) ────────────────────

const ctx = {
  portalToken:    '',
  clientId:       '',
  agentId:        '',
  agentKey:       '',
  agentToken:     '',
  refreshToken:   '',
};

// ─── Helper HTTP ─────────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Health', () => {
  test('GET /health returns 200', async () => {
    const res = await fetch(`${API.replace('/api/v1', '')}/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, 'ok');
  });
});

describe('Portal Auth', () => {
  test('Login con credenciales incorrectas → 401', async () => {
    const { status } = await req('POST', '/portal/login', { username: 'wrong', password: 'wrong' });
    assert.equal(status, 401);
  });

  test('Login con credenciales válidas → 200 con token', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(status, 200);
    assert.ok(data.token, 'Debe retornar un JWT');
    ctx.portalToken = data.token;
  });

  test('Dashboard sin token → 401', async () => {
    const { status } = await req('GET', '/dashboard');
    assert.equal(status, 401);
  });

  test('Dashboard con token de portal → 200 con stats', async () => {
    const { status, data } = await req('GET', '/dashboard', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(data.stats, 'Debe retornar stats');
    assert.ok('devices' in data.stats && 'agents' in data.stats, 'Stats incompletas');
  });

  // Fase 6 del gap analysis vs HP SDS — shape de los campos nuevos del dashboard.
  test('Dashboard: agentVersions y alertsByClass tienen la forma esperada', async () => {
    const { status, data } = await req('GET', '/dashboard', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.agentVersions), 'agentVersions debe ser un array');
    assert.ok(typeof data.currentAgentVersion === 'string', 'currentAgentVersion debe venir como string');
    assert.ok(Array.isArray(data.alertsByClass), 'alertsByClass debe ser un array');
    for (const row of data.alertsByClass) {
      assert.ok(typeof row.alert_class === 'string' && typeof row.label === 'string' && typeof row.count === 'number');
    }
    assert.equal(typeof data.stats.agents.reporting, 'number', 'stats.agents.reporting debe existir');
    assert.equal(typeof data.stats.devicesUnmanaged, 'number', 'stats.devicesUnmanaged debe existir');
    assert.ok(data.discovered && typeof data.discovered.today === 'number' && typeof data.discovered.pendingTotal === 'number');
  });

  test('Lista de clientes → 200', async () => {
    const { status, data } = await req('GET', '/clients', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data), 'Debe retornar array');
    assert.ok(data.length > 0, 'Necesita al menos un cliente (ejecutar npm run seed)');
    ctx.clientId = data[0].id;
  });
});

describe('Ciclo de vida del agente', () => {
  test('Crear agente → retorna activation key', async () => {
    const { status, data } = await req('POST', '/agents', {
      clientId: ctx.clientId,
      name:     'Agente E2E Test',
    }, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(data.key,     'Debe retornar key');
    assert.ok(data.agentId, 'Debe retornar agentId');
    assert.equal(data.key.length, 64, 'Key debe tener 64 chars hex');
    ctx.agentId  = data.agentId;
    ctx.agentKey = data.key;
  });

  test('Activar con llave incorrecta → 401', async () => {
    const { status } = await req('POST', '/agents/activate', {
      key:        'a'.repeat(64),
      hardwareId: 'TEST-HW-INVALID',
    });
    assert.equal(status, 401);
  });

  test('Activar con llave válida → JWT + refresh token', async () => {
    const { status, data } = await req('POST', '/agents/activate', {
      key:        ctx.agentKey,
      hardwareId: 'TEST-HW-E2E-001',
    });
    assert.equal(status, 200);
    assert.ok(data.token,         'Debe retornar JWT');
    assert.ok(data.refresh_token, 'Debe retornar refresh_token');
    ctx.agentToken  = data.token;
    ctx.refreshToken = data.refresh_token;
  });

  test('Reusar llave de activación → 401 (one-time use)', async () => {
    const { status } = await req('POST', '/agents/activate', {
      key:        ctx.agentKey,
      hardwareId: 'TEST-HW-E2E-DUP',
    });
    assert.equal(status, 401);
  });

  test('Lista de agentes refleja el nuevo agente', async () => {
    const { status, data } = await req('GET', '/agents', undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
    const created = data.find((a: any) => a.id === ctx.agentId);
    assert.ok(created,                     'Agente creado debe aparecer en la lista');
    assert.equal(created.status, 'active', 'Estado debe ser active tras activación');
    assert.equal(created.hardware_id, 'TEST-HW-E2E-001', 'hardware_id debe estar guardado');
  });
});

describe('Heartbeat', () => {
  test('Agente envía heartbeat → 200', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {
      version:     '1.0.0-test',
      deviceCount: 5,
      snmpErrors:  0,
      memoryMb:    48,
    }, ctx.agentToken);
    assert.equal(status, 200);
  });

  test('Token de portal no puede hacer heartbeat → 403', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`,
      { version: '1.0.0' }, ctx.portalToken);
    assert.equal(status, 403);
  });

  test('Sin token no puede hacer heartbeat → 401', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`,
      { version: '1.0.0' });
    assert.equal(status, 401);
  });
});

