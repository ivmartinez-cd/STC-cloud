// Ajustes globales (modules/system-settings) — Fase 5 del plan de migración:
// el módulo no tenía ningún test; esto cubre dominio (validación), repositorio
// (get/set) y presentación (GET/PUT, 403 para operator, 400 por schema).
// Ejecutar: API_URL=http://localhost:3000/api/v1 PORTAL_ADMIN_PASSWORD=... npx tsx --test src/tests/systemSettings.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SYSTEM_SETTINGS, validateOfflineThresholdMinutes } from '../modules/system-settings/domain/system-settings';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function req(method: string, path: string, body?: unknown, token?: string) {
  // Sin body no se manda Content-Type: Fastify responde 400 a un DELETE/GET con
  // `application/json` y body vacío.
  const headers: Record<string, string> = body !== undefined ? { 'Content-Type': 'application/json' } : {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

describe('system-settings — dominio (unitario puro)', () => {
  test('acepta enteros entre 1 y 1440 (también como string numérico)', () => {
    assert.equal(validateOfflineThresholdMinutes(5), 5);
    assert.equal(validateOfflineThresholdMinutes('1440'), 1440);
    assert.equal(DEFAULT_SYSTEM_SETTINGS.agentOfflineThresholdMinutes, 5);
  });

  test('rechaza 0, decimales, fuera de rango y no numéricos', () => {
    for (const bad of [0, 1441, 2.5, 'diez', null, undefined, -1]) {
      assert.throws(() => validateOfflineThresholdMinutes(bad), /entero entre 1 y 1440/, String(bad));
    }
  });
});

describe('system-settings — e2e /settings/system', () => {
  const ctx = { adminToken: '', operatorToken: '', operatorId: '', initial: 0 };
  const opUser = `op_settings_${Date.now()}`;

  test('setup: login admin, crear operator y loguearlo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const created = await req('POST', '/portal/users', { username: opUser, password: 'Operator1234', role: 'operator' }, ctx.adminToken);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    ctx.operatorId = created.data.id;
    const opLogin = await req('POST', '/portal/login', { username: opUser, password: 'Operator1234' });
    assert.equal(opLogin.status, 200);
    ctx.operatorToken = opLogin.data.token;
  });

  test('GET devuelve el umbral vigente (cualquier rol autenticado)', async () => {
    const admin = await req('GET', '/settings/system', undefined, ctx.adminToken);
    assert.equal(admin.status, 200);
    assert.equal(typeof admin.data.agent_offline_threshold_minutes, 'number');
    ctx.initial = admin.data.agent_offline_threshold_minutes;
    const op = await req('GET', '/settings/system', undefined, ctx.operatorToken);
    assert.equal(op.status, 200);
  });

  test('PUT como operator → 403 (afecta a toda la flota)', async () => {
    const { status } = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: 15 }, ctx.operatorToken);
    assert.equal(status, 403);
  });

  test('PUT fuera de rango → 400 (schema) sin tocar el valor', async () => {
    for (const bad of [0, 1441, 'x']) {
      const { status } = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: bad }, ctx.adminToken);
      assert.equal(status, 400, String(bad));
    }
    const { data } = await req('GET', '/settings/system', undefined, ctx.adminToken);
    assert.equal(data.agent_offline_threshold_minutes, ctx.initial);
  });

  test('PUT como admin persiste y GET lo refleja; se restaura el valor inicial', async () => {
    const target = ctx.initial === 15 ? 20 : 15;
    const put = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: target }, ctx.adminToken);
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.agent_offline_threshold_minutes, target);
    const get = await req('GET', '/settings/system', undefined, ctx.adminToken);
    assert.equal(get.data.agent_offline_threshold_minutes, target);

    const restore = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: ctx.initial }, ctx.adminToken);
    assert.equal(restore.status, 200);
  });

  test('cleanup: borrar el operator de prueba', async () => {
    const { status } = await req('DELETE', `/portal/users/${ctx.operatorId}`, undefined, ctx.adminToken);
    assert.ok(status === 200 || status === 204, `status ${status}`);
  });
});
