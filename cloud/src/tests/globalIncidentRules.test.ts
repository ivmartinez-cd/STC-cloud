// Reglas de incidentes GLOBALES (`client_id IS NULL`) — handoff hifi #3,
// cierre de gaps post-verificación, 26/08/2026. Antes sólo existía edición
// POR CLIENTE (`PUT /clients/:id/incident-rules`, que a propósito nunca toca
// las filas globales); esto cubre el editor real de "VER REGLA" en
// Configuración del sistema: GET/PUT /settings/system/incident-rules,
// 403 para operator, y que no pisa las filas por-cliente.
// Ejecutar: API_URL=http://localhost:3000/api/v1 PORTAL_ADMIN_PASSWORD=... npx tsx --test src/tests/globalIncidentRules.test.ts

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
const ctx = { adminToken: '', operatorToken: '', clientId: '', original: null as any };
const opUser = `op_gir_${ts}`;

describe('reglas de incidentes globales — GET/PUT /settings/system/incident-rules', () => {
  test('setup: login admin, crear operator, crear cliente, leer regla "availability" original', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const created = await req('POST', '/portal/users', { username: opUser, password: 'Operator1234', role: 'operator' }, ctx.adminToken);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const opLogin = await req('POST', '/portal/login', { username: opUser, password: 'Operator1234' });
    assert.equal(opLogin.status, 200);
    ctx.operatorToken = opLogin.data.token;

    const client = await req('POST', '/clients', { name: `Global Rules Test ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const list = await req('GET', '/settings/system/incident-rules', undefined, ctx.adminToken);
    assert.equal(list.status, 200);
    ctx.original = list.data.find((r: any) => r.class === 'availability');
    assert.ok(ctx.original, 'la fila global sembrada "availability" debe existir');
    assert.equal(ctx.original.client_id, null);
  });

  test('GET también funciona para operator (lectura no restringida)', async () => {
    const { status, data } = await req('GET', '/settings/system/incident-rules', undefined, ctx.operatorToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
  });

  test('PUT como operator → 403 (regla global afecta a toda la red)', async () => {
    const { status } = await req('PUT', '/settings/system/incident-rules', { rules: [{ class: 'availability', enabled: true, delay_minutes: 5 }] }, ctx.operatorToken);
    assert.equal(status, 403);
  });

  test('PUT sin rules → 400', async () => {
    const { status } = await req('PUT', '/settings/system/incident-rules', {}, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('PUT como admin actualiza la fila global y no crea una fila por-cliente', async () => {
    const put = await req('PUT', '/settings/system/incident-rules', {
      rules: [{ class: 'availability', enabled: true, min_severity: 'warning', delay_minutes: 7, sla_hours: 4, auto_close_on_alerts_resolved: true }],
    }, ctx.adminToken);
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const row = put.data[0];
    assert.equal(row.client_id, null);
    assert.equal(row.enabled, true);
    assert.equal(row.delay_minutes, 7);
    assert.equal(row.sla_hours, 4);
    assert.equal(row.auto_close_on_alerts_resolved, true);

    const list = await req('GET', '/settings/system/incident-rules', undefined, ctx.adminToken);
    const updated = list.data.find((r: any) => r.class === 'availability');
    assert.equal(updated.delay_minutes, 7);

    const perClient = await req('GET', `/clients/${ctx.clientId}/incident-rules`, undefined, ctx.adminToken);
    const inherited = perClient.data.find((r: any) => r.class === 'availability');
    assert.equal(inherited.client_id, null, 'el cliente nuevo, sin override propio, debe seguir viendo la fila GLOBAL heredada');
    assert.equal(inherited.delay_minutes, 7, 'y debe reflejar el valor recién actualizado de esa fila global');
  });

  test('cleanup: restaurar la fila global "availability" a sus valores originales', async () => {
    const restore = await req('PUT', '/settings/system/incident-rules', {
      rules: [{
        class: 'availability',
        enabled: ctx.original.enabled,
        min_severity: ctx.original.min_severity,
        delay_minutes: ctx.original.delay_minutes,
        sla_hours: ctx.original.sla_hours,
        auto_close_on_alerts_resolved: ctx.original.auto_close_on_alerts_resolved,
      }],
    }, ctx.adminToken);
    assert.equal(restore.status, 200);
    assert.equal(restore.data[0].delay_minutes, ctx.original.delay_minutes);
  });
});
