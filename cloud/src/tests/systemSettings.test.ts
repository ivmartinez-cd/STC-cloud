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
    // "Modelo unificado de umbrales" (26/08/2026): el default del umbral de
    // EQUIPO es 300 min (5h) — mismo valor que tenía hardcodeado
    // `heartbeatMonitor.ts`/`constants.ts` antes de esta pasada.
    assert.equal(DEFAULT_SYSTEM_SETTINGS.deviceOfflineThresholdMinutes, 300);
  });

  test('rechaza 0, decimales, fuera de rango y no numéricos', () => {
    for (const bad of [0, 1441, 2.5, 'diez', null, undefined, -1]) {
      assert.throws(() => validateOfflineThresholdMinutes(bad), /entero entre 1 y 1440/, String(bad));
    }
  });
});

describe('system-settings — e2e /settings/system', () => {
  const ctx = { adminToken: '', operatorToken: '', operatorId: '', initialAgent: 0, initialDevice: 0 };
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

  test('GET devuelve los DOS umbrales vigentes (cualquier rol autenticado)', async () => {
    const admin = await req('GET', '/settings/system', undefined, ctx.adminToken);
    assert.equal(admin.status, 200);
    assert.equal(typeof admin.data.agent_offline_threshold_minutes, 'number');
    assert.equal(typeof admin.data.device_offline_threshold_minutes, 'number');
    ctx.initialAgent = admin.data.agent_offline_threshold_minutes;
    ctx.initialDevice = admin.data.device_offline_threshold_minutes;
    const op = await req('GET', '/settings/system', undefined, ctx.operatorToken);
    assert.equal(op.status, 200);
  });

  test('PUT como operator → 403 (afecta a toda la flota)', async () => {
    const { status } = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: 15 }, ctx.operatorToken);
    assert.equal(status, 403);
  });

  test('PUT sin ningún campo → 400 (nada para actualizar)', async () => {
    const { status } = await req('PUT', '/settings/system', {}, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('PUT fuera de rango (cualquiera de los dos campos) → 400 sin tocar ningún valor', async () => {
    for (const bad of [0, 1441, 'x']) {
      const a = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: bad }, ctx.adminToken);
      assert.equal(a.status, 400, String(bad));
      const d = await req('PUT', '/settings/system', { device_offline_threshold_minutes: bad }, ctx.adminToken);
      assert.equal(d.status, 400, String(bad));
    }
    const { data } = await req('GET', '/settings/system', undefined, ctx.adminToken);
    assert.equal(data.agent_offline_threshold_minutes, ctx.initialAgent);
    assert.equal(data.device_offline_threshold_minutes, ctx.initialDevice);
  });

  test('PUT parcial (sólo un campo) deja el otro intacto', async () => {
    const targetAgent = ctx.initialAgent === 15 ? 20 : 15;
    const putAgent = await req('PUT', '/settings/system', { agent_offline_threshold_minutes: targetAgent }, ctx.adminToken);
    assert.equal(putAgent.status, 200, JSON.stringify(putAgent.data));
    assert.equal(putAgent.data.agent_offline_threshold_minutes, targetAgent);
    assert.equal(putAgent.data.device_offline_threshold_minutes, ctx.initialDevice, 'el umbral de equipo no debe moverse al patchear sólo el de agente');

    const targetDevice = ctx.initialDevice === 60 ? 90 : 60;
    const putDevice = await req('PUT', '/settings/system', { device_offline_threshold_minutes: targetDevice }, ctx.adminToken);
    assert.equal(putDevice.status, 200, JSON.stringify(putDevice.data));
    assert.equal(putDevice.data.device_offline_threshold_minutes, targetDevice);
    assert.equal(putDevice.data.agent_offline_threshold_minutes, targetAgent, 'el umbral de agente no debe moverse al patchear sólo el de equipo');

    const get = await req('GET', '/settings/system', undefined, ctx.adminToken);
    assert.equal(get.data.agent_offline_threshold_minutes, targetAgent);
    assert.equal(get.data.device_offline_threshold_minutes, targetDevice);

    const restore = await req('PUT', '/settings/system', {
      agent_offline_threshold_minutes: ctx.initialAgent,
      device_offline_threshold_minutes: ctx.initialDevice,
    }, ctx.adminToken);
    assert.equal(restore.status, 200);
    assert.equal(restore.data.agent_offline_threshold_minutes, ctx.initialAgent);
    assert.equal(restore.data.device_offline_threshold_minutes, ctx.initialDevice);
  });

  test('cleanup: borrar el operator de prueba', async () => {
    const { status } = await req('DELETE', `/portal/users/${ctx.operatorId}`, undefined, ctx.adminToken);
    assert.ok(status === 200 || status === 204, `status ${status}`);
  });
});
