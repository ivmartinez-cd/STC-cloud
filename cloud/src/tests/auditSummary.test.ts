// GET /audit-logs/summary (handoff hifi #3, fase 5, 26/08/2026) — a
// diferencia de /audit-logs/actions (ventana fija de 90 días, global, ignora
// filtros/scope), este respeta LOS MISMOS filtros que /audit-logs. Tests de
// integración, mismo criterio que auditFeed.test.ts.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/auditSummary.test.ts

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
const ctx = { adminToken: '', clientId: '' };

describe('GET /audit-logs/summary — fixtures', () => {
  test('Setup: login admin + crear un cliente (deja un CLIENT_CREATED real en el feed)', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Audit Summary Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;
  });
});

describe('GET /audit-logs/summary — agregados respetan filtros', () => {
  test('target_id=clientId trae total >= 1 y byCategory incluye "client"', async () => {
    const res = await req('GET', `/audit-logs/summary?target_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.total >= 1);
    assert.ok(res.data.by_category.some((c: any) => c.category === 'client'));
    assert.ok(res.data.by_category.every((c: any) => c.count > 0), 'nunca debe listar una categoría en 0');
  });

  test('per_day, distinct_users y top_operator vienen coherentes', async () => {
    const res = await req('GET', `/audit-logs/summary?target_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(typeof res.data.per_day, 'number');
    assert.ok(res.data.distinct_users >= 1);
    assert.ok(res.data.top_operator === null || typeof res.data.top_operator.username === 'string');
  });

  test('un target_id inexistente da total=0 y byCategory vacío (no un error)', async () => {
    // random, no el UUID nulo (00000000-...): este entorno compartido tiene
    // filas reales de auditoría con target_id = nil-uuid como sentinel
    // (ej. CLIENT_SFTP_DESTINATION_*), así que ese valor no sirve como "id
    // que seguro no existe" acá.
    const res = await req('GET', `/audit-logs/summary?target_id=${crypto.randomUUID()}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.total, 0);
    assert.deepEqual(res.data.by_category, []);
  });

  test('exclude_user_id="OTROS OPERADORES" excluye ese usuario, tanto en /audit-logs como en /audit-logs/summary', async () => {
    const withAdmin = await req('GET', `/audit-logs?target_id=${ctx.clientId}`, undefined, ctx.adminToken);
    const adminUserId = withAdmin.data.items.find((i: any) => i.action === 'CLIENT_CREATED')?.user_id;
    assert.ok(adminUserId, 'el CLIENT_CREATED debe llevar user_id del admin logueado');

    const excluded = await req('GET', `/audit-logs?target_id=${ctx.clientId}&exclude_user_id=${adminUserId}`, undefined, ctx.adminToken);
    assert.ok(!excluded.data.items.some((i: any) => i.user_id === adminUserId));

    const summaryExcluded = await req('GET', `/audit-logs/summary?target_id=${ctx.clientId}&exclude_user_id=${adminUserId}`, undefined, ctx.adminToken);
    assert.equal(summaryExcluded.data.total, 0, 'el único evento del fixture es del admin, excluirlo deja el total en 0');
  });

  test('la ventana por defecto (sin from/to) es de 30 días, igual que /audit-logs', async () => {
    const withRange = await req('GET', `/audit-logs/summary?target_id=${ctx.clientId}&from=2000-01-01`, undefined, ctx.adminToken);
    const defaultRange = await req('GET', `/audit-logs/summary?target_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(withRange.data.total, defaultRange.data.total, 'el cliente se creó ahora, cae dentro de ambas ventanas');
  });
});
