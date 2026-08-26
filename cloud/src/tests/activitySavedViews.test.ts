// "Guardar vista" en Movimientos — cierre de gap post-verificación del
// handoff hifi #3 (26/08/2026). GET/POST/DELETE /activity/saved-views,
// personales por usuario (nunca se ven ni se pueden borrar entre sí).
// Ejecutar: API_URL=http://localhost:3000/api/v1 PORTAL_ADMIN_PASSWORD=... npx tsx --test src/tests/activitySavedViews.test.ts

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
  const isBodyless = method === 'GET' || method === 'HEAD' || method === 'DELETE';
  const headers: Record<string, string> = {};
  if (!isBodyless) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: isBodyless ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const ts = Date.now();
const ctx = { adminToken: '', operatorToken: '', viewId: '' };
const opUser = `op_activity_views_${ts}`;
const FILTERS = { from: '2026-08-01', to: '2026-08-26', q: 'toner', segment: 'config' };

describe('vistas guardadas de Movimientos — GET/POST/DELETE /activity/saved-views', () => {
  test('setup: login admin, crear operator y loguearlo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const created = await req('POST', '/portal/users', { username: opUser, password: 'Operator1234', role: 'operator' }, ctx.adminToken);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const opLogin = await req('POST', '/portal/login', { username: opUser, password: 'Operator1234' });
    assert.equal(opLogin.status, 200);
    ctx.operatorToken = opLogin.data.token;
  });

  test('GET sin vistas guardadas → array vacío', async () => {
    const r = await req('GET', '/activity/saved-views', undefined, ctx.adminToken);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, []);
  });

  test('POST sin name → 400', async () => {
    const r = await req('POST', '/activity/saved-views', { filters: FILTERS }, ctx.adminToken);
    assert.equal(r.status, 400);
  });

  test('POST sin filters → 400', async () => {
    const r = await req('POST', '/activity/saved-views', { name: 'Mi vista' }, ctx.adminToken);
    assert.equal(r.status, 400);
  });

  test('POST válido → 201, refleja name/filters', async () => {
    const r = await req('POST', '/activity/saved-views', { name: 'Cambios de config del mes', filters: FILTERS }, ctx.adminToken);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.name, 'Cambios de config del mes');
    assert.deepEqual(r.data.filters, FILTERS);
    assert.ok(r.data.id);
    assert.ok(r.data.created_at);
    ctx.viewId = r.data.id;
  });

  test('GET del admin trae la vista recién creada', async () => {
    const r = await req('GET', '/activity/saved-views', undefined, ctx.adminToken);
    assert.equal(r.status, 200);
    assert.ok(r.data.some((v: any) => v.id === ctx.viewId));
  });

  test('GET del operator NO trae la vista del admin — son personales', async () => {
    const r = await req('GET', '/activity/saved-views', undefined, ctx.operatorToken);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, []);
  });

  test('DELETE de otro usuario → 404 (el operator no puede borrar la vista del admin)', async () => {
    const r = await req('DELETE', `/activity/saved-views/${ctx.viewId}`, undefined, ctx.operatorToken);
    assert.equal(r.status, 404);
    const stillThere = await req('GET', '/activity/saved-views', undefined, ctx.adminToken);
    assert.ok(stillThere.data.some((v: any) => v.id === ctx.viewId), 'no debe haberse borrado');
  });

  test('DELETE id inexistente → 404', async () => {
    const r = await req('DELETE', '/activity/saved-views/00000000-0000-0000-0000-000000000000', undefined, ctx.adminToken);
    assert.equal(r.status, 404);
  });

  test('DELETE del propio dueño → 204, desaparece', async () => {
    const r = await req('DELETE', `/activity/saved-views/${ctx.viewId}`, undefined, ctx.adminToken);
    assert.equal(r.status, 204);
    const gone = await req('GET', '/activity/saved-views', undefined, ctx.adminToken);
    assert.deepEqual(gone.data, []);
  });
});
