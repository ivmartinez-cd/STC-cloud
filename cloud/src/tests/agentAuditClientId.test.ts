// Gap real cerrado post-verificación del handoff hifi #3 (26/08/2026): las
// acciones de auditoría del módulo agents no guardaban `client_id`, así que
// Movimientos las mostraba como "Sin cliente" aunque el agente sí
// perteneciera a uno. Cubre los call-sites más comunes (creación, activación,
// comando remoto) — no los ~19 call-sites de OTROS módulos (auth, clientes,
// dashboard, etc.) que tienen el mismo gap documentado aparte en
// `services/auditService.ts` como deuda ya conocida, fuera de este handoff.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/agentAuditClientId.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

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
const ctx = { adminToken: '', clientId: '', agentId: '', agentToken: '' };

describe('Auditoría de agentes trae client_id', () => {
  test('Setup: login admin, crear cliente + agente + activar + un comando remoto', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Agent Audit ClientId Test ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Audit ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;

    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-AUDIT-${ts}` });
    ctx.agentToken = activate.data.token;

    const cmd = await req('POST', `/agents/${ctx.agentId}/command`, { type: 'FORCE_SCAN' }, ctx.adminToken);
    assert.equal(cmd.status, 200);
  });

  test('AGENT_CREATED, AGENT_ACTIVATED y AGENT_COMMAND quedan con client_id del agente', async () => {
    const res = await req('GET', `/audit-logs?target_id=${ctx.agentId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    const byAction = Object.fromEntries(res.data.items.map((i: any) => [i.action, i]));
    assert.equal(byAction.AGENT_CREATED?.client_id, ctx.clientId, 'AGENT_CREATED debe traer el client_id del agente');
    assert.equal(byAction.AGENT_ACTIVATED?.client_id, ctx.clientId, 'AGENT_ACTIVATED debe traer el client_id del agente');
    assert.equal(byAction.AGENT_COMMAND?.client_id, ctx.clientId, 'AGENT_COMMAND debe traer el client_id del agente');
  });
});
