// E2E — seguridad mínima (CSRF, mass assignment), rotación de refresh token y
// revocación de agente. Separado de e2e.test.ts (deuda de sizes-baseline,
// 2026-08-26) sólo por tamaño de archivo; fixture propia (cliente + agente +
// activar) porque corre en su propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/e2eSecurityAndTokens.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

const ts = Date.now();
const ctx = {
  portalToken: '', clientId: '', agentId: '', agentToken: '',
  freshAgentId: '', freshAgentToken: '', freshRefresh: '',
};

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

describe('E2E seguridad/tokens — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.portalToken = login.data.token;

    const client = await req('POST', '/clients', { name: `E2E Security Test Client ${ts}` }, ctx.portalToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente E2E Security ${ts}` }, ctx.portalToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;

    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-E2E-SECURITY-${ts}` });
    assert.equal(activate.status, 200);
    ctx.agentToken = activate.data.token;
  });
});

describe('Seguridad mínima', () => {
  test('Login setea cookies de sesión y CSRF; mutación sin header CSRF → 403, con header → 200', async () => {
    const loginRes = await fetch(`${API}/portal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    assert.equal(loginRes.status, 200);

    const setCookies = loginRes.headers.getSetCookie();
    const sessionCookie = setCookies.find(c => c.startsWith('stc_session='))?.split(';')[0];
    const csrfCookie = setCookies.find(c => c.startsWith('stc_csrf='))?.split(';')[0];
    assert.ok(sessionCookie, 'Debe setear cookie de sesión stc_session');
    assert.ok(csrfCookie, 'Debe setear cookie CSRF stc_csrf (no httpOnly)');
    const csrfValue = csrfCookie!.split('=')[1];
    const cookieHeader = `${sessionCookie}; ${csrfCookie}`;

    const withoutCsrf = await fetch(`${API}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ name: 'CSRF Test Client (sin header)' }),
    });
    assert.equal(withoutCsrf.status, 403);

    const withCsrf = await fetch(`${API}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrfValue },
      body: JSON.stringify({ name: 'CSRF Test Client (con header)' }),
    });
    assert.equal(withCsrf.status, 200);
  });

  test('createClient descarta campos que no son columnas reales (mass assignment)', async () => {
    const { status, data } = await req('POST', '/clients', {
      name: 'Cliente Whitelist Test',
      contact_email: 'test@example.com',
      business_name: 'Nombre Falso Inventado',
    }, ctx.portalToken);
    assert.equal(status, 200);
    assert.equal(data.name, 'Cliente Whitelist Test');
    assert.equal(data.contact_email, 'test@example.com');
    assert.equal(data.business_name, undefined, 'Campos que no son columnas reales no deben persistirse');
  });

  test('DELETE /devices/offline sin agent_id → 400', async () => {
    const { status } = await req('DELETE', '/devices/offline', undefined, ctx.portalToken);
    assert.equal(status, 400);
  });
});

describe('Rotación de refresh token', () => {
  test('Setup: crear segundo agente para prueba de refresh', async () => {
    const { data: createData } = await req('POST', '/agents', {
      clientId: ctx.clientId, name: 'Agente E2E Refresh',
    }, ctx.portalToken);
    ctx.freshAgentId = createData.agentId;

    const { data: actData } = await req('POST', '/agents/activate', {
      key: createData.key, hardwareId: 'TEST-HW-REFRESH',
    });
    ctx.freshAgentToken = actData.token;
    ctx.freshRefresh    = actData.refresh_token;
  });

  test('Refresh retorna nuevo JWT y nuevo refresh token', async () => {
    const { status, data } = await req('POST', '/agents/refresh', {
      agentId:       ctx.freshAgentId,
      refresh_token: ctx.freshRefresh,
    });
    assert.equal(status, 200);
    assert.ok(data.token,         'Debe retornar nuevo JWT');
    assert.ok(data.refresh_token, 'Debe retornar nuevo refresh_token');
    assert.notEqual(data.token,         ctx.freshAgentToken, 'JWT debe ser diferente');
    assert.notEqual(data.refresh_token, ctx.freshRefresh,    'Refresh token debe ser diferente');
    ctx.freshAgentToken = data.token;
    ctx.freshRefresh    = data.refresh_token;
  });

  test('Refresh token inválido → 401', async () => {
    const { status } = await req('POST', '/agents/refresh', {
      agentId:       ctx.freshAgentId,
      refresh_token: 'f'.repeat(128), // token incorrecto
    });
    assert.equal(status, 401);
  });
});

describe('Revocación de agente', () => {
  test('Portal revoca agente → 200', async () => {
    const { status } = await req('POST', `/agents/${ctx.agentId}/revoke`, {}, ctx.portalToken);
    assert.equal(status, 200);
  });

  test('Agente revocado no puede hacer heartbeat → 404', async () => {
    // agentAuth responde 404 ("Agente no encontrado o revocado") antes de consultar
    // la blacklist de Redis (que daría 401). Ver authMiddleware.ts.
    const { status } = await req('POST', `/agents/${ctx.agentId}/heartbeat`,
      { version: '1.0.0' }, ctx.agentToken);
    assert.equal(status, 404);
  });

  test('Agente revocado aparece como revoked en lista', async () => {
    const { data } = await req('GET', '/agents', undefined, ctx.portalToken);
    const revoked = data.find((a: any) => a.id === ctx.agentId);
    assert.equal(revoked?.status, 'revoked');
  });

  // Fase 6 del gap analysis vs HP SDS — bug real: `agentsStats` no filtraba
  // status='revoked' (offlineAgents sí lo hacía), así que un agente revocado
  // inflaba `stats.agents.total` para siempre. Envuelve el revoke de
  // `freshAgentId` (agente dedicado de la suite de refresh token, no se
  // reusa después) con una lectura del dashboard antes/después.
  test('Cleanup: revocar agente de refresh test — no debe inflar stats.agents.total', async () => {
    const before = await req('GET', '/dashboard', undefined, ctx.portalToken);
    const totalBefore = before.data.stats.agents.total;

    const { status } = await req('POST', `/agents/${ctx.freshAgentId}/revoke`, {}, ctx.portalToken);
    assert.equal(status, 200);

    const after = await req('GET', '/dashboard', undefined, ctx.portalToken);
    assert.equal(after.data.stats.agents.total, totalBefore - 1, 'un agente revocado no debe contar en stats.agents.total');
  });
});
