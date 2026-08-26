// Umbral global de consumibles (Configuración del sistema) como default de
// `supply_request_threshold_pct` para clientes NUEVOS — handoff hifi #3,
// cierre de gaps post-verificación, 26/08/2026. Antes el umbral global se
// guardaba y se veía en la UI pero no conectaba con nada; esto lo hace real.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/clientSupplyThresholdDefault.test.ts

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
const ctx = { adminToken: '', originalThreshold: 0 };

describe('Umbral global de consumibles → default de cliente nuevo', () => {
  test('Setup: login admin, guardar el umbral global en 37%', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const before = await req('GET', '/settings/system', undefined, ctx.adminToken);
    ctx.originalThreshold = before.data.supply_threshold_critical_pct;

    const put = await req('PUT', '/settings/system', { supply_threshold_critical_pct: 37 }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.equal(put.data.supply_threshold_critical_pct, 37);
  });

  test('un cliente creado DESPUÉS hereda el 37% como supply_request_threshold_pct', async () => {
    const client = await req('POST', '/clients', { name: `Threshold Default Test ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);

    const settings = await req('GET', `/clients/${client.data.id}/supply-request-settings`, undefined, ctx.adminToken);
    assert.equal(settings.status, 200);
    assert.equal(settings.data.threshold_pct, 37, 'el cliente nuevo debe heredar el umbral global vigente al crearse');
  });

  test('cleanup: restaurar el umbral global original', async () => {
    const put = await req('PUT', '/settings/system', { supply_threshold_critical_pct: ctx.originalThreshold }, ctx.adminToken);
    assert.equal(put.status, 200);
  });
});
