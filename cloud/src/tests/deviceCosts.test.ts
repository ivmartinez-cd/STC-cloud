// Costes por equipo (Fase 4.5 del gap analysis vs HP SDS, re-comparación
// 24/08/2026) — e2e + verificación de que el informe de uso suma las
// columnas de billing figures cuando hay costes cargados.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/deviceCosts.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { periodCost } from '../modules/device-costs/domain/entities/device-costs';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    const raw = await res.arrayBuffer();
    return { status: res.status, data: {} as any, raw: Buffer.from(raw) };
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any, raw: null as Buffer | null };
}

describe('Dominio puro — periodCost', () => {
  test('calcula mono/color/total con redondeo a 2 decimales', () => {
    const c = periodCost({ monoPageCost: 0.0227, colorPageCost: 0.1155 }, 1000, 200);
    assert.equal(c.mono, 22.7);
    assert.equal(c.color, 23.1);
    assert.equal(c.total, 45.8);
  });

  test('sin costes cargados → null (no 0: "sin dato" ≠ "gratis")', () => {
    const c = periodCost({ monoPageCost: null, colorPageCost: null }, 1000, 200);
    assert.equal(c.mono, null);
    assert.equal(c.total, null);
  });
});

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', agentToken: '', deviceId: '', deviceSerial: `SN-COSTS-${ts}` };

function sync(agentToken: string, serial: string, ip: string, extra: Record<string, unknown> = {}) {
  return req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: serial, ip, brand: 'hp',
      time: new Date().toISOString(), total_pages: 500, mono_pages: 400, color_pages: 100,
      offline: false, ...extra,
    }],
  }, agentToken);
}

describe('Costes por equipo — e2e', () => {
  test('setup: cliente + agente + dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const client = await req('POST', '/clients', { name: `Costs Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Costs ${ts}` }, ctx.adminToken);
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-COSTS-${ts}` });
    ctx.agentToken = activate.data.token;
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.247.10');
    assert.equal(s.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    ctx.deviceId = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial).id;
  });

  test('GET sin costes cargados → todos null', async () => {
    const res = await req('GET', `/devices/${ctx.deviceId}/costs`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.capital_cost, null);
    assert.equal(res.data.currency, 'ARS');
  });

  test('PUT y roundtrip', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}/costs`, {
      capital_cost: 287.66, quarterly_rental: 0, mono_page_cost: 0.0227,
      color_page_cost: 0.1155, service_contract_cost: 30.33, service_contract_years: 1,
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.equal(put.data.mono_page_cost, 0.0227);
    const got = await req('GET', `/devices/${ctx.deviceId}/costs`, undefined, ctx.adminToken);
    assert.equal(got.data.capital_cost, 287.66);
    assert.equal(got.data.service_contract_years, 1);
  });

  test('PUT actualiza (upsert, no duplica)', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}/costs`, { mono_page_cost: 0.05 }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.equal(put.data.mono_page_cost, 0.05);
    assert.equal(put.data.capital_cost, null, 'PUT reemplaza el set completo');
  });

  test('coste negativo → 400', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}/costs`, { mono_page_cost: -1 }, ctx.adminToken);
    assert.equal(put.status, 400);
  });

  test('equipo inexistente → 404', async () => {
    const res = await req('GET', '/devices/00000000-0000-0000-0000-000000000000/costs', undefined, ctx.adminToken);
    assert.equal(res.status, 404);
  });

  test('el informe de uso agrega columnas de coste cuando hay costes', async () => {
    await req('PUT', `/devices/${ctx.deviceId}/costs`, {
      mono_page_cost: 0.0227, color_page_cost: 0.1155,
    }, ctx.adminToken);
    const period = new Date().toISOString().slice(0, 7);
    const rep = await req('POST', '/scheduled-reports', {
      name: `Uso con costes ${ts}`, report_type: 'usage',
      client_id: ctx.clientId, params: { period }, format: 'csv',
    }, ctx.adminToken);
    assert.equal(rep.status, 201);
    const dl = await req('GET', `/scheduled-reports/${rep.data.id}/download`, undefined, ctx.adminToken);
    assert.equal(dl.status, 200);
    const csv = dl.raw!.toString('utf8');
    assert.ok(csv.includes('Coste mono') && csv.includes('Coste total'), 'CSV debe incluir billing figures');
    await req('DELETE', `/scheduled-reports/${rep.data.id}`, undefined, ctx.adminToken);
  });
});
