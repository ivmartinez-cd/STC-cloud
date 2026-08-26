// API pública (integración ERP) — API keys por cliente + webhooks. Tests de
// integración, mismo criterio que ipRangesCredentials.test.ts (backend
// corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/publicApi.test.ts

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

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  // Content-Type sólo si hay body: Fastify rechaza con 400 (FST_ERR_CTP_EMPTY_JSON_BODY)
  // un application/json con body vacío — relevante acá porque el DELETE de
  // revocación no manda body.
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

/** Igual que `req`, pero autenticado con `X-Api-Key` en vez de Bearer. */
async function pub(method: string, path: string, body?: unknown, apiKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

/** Reintenta `fn` hasta que `predicate(result)` sea true, o se agote el tiempo. */
async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 8000, stepMs = 300): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, stepMs));
  } while (Date.now() < deadline);
  return last;
}

const ts = Date.now();
const ctx = {
  adminToken: '',
  clientAId: '', clientBId: '',
  agentAId: '', agentAKey: '', agentAToken: '',
  deviceASerial: `SN-PUBAPI-${ts}`,
  apiKeyA: '', apiKeyAId: '',
  apiKeyB: '',
};

describe('API pública — fixtures', () => {
  test('Setup: login admin, crear 2 clientes + 1 agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const clientA = await req('POST', '/clients', { name: `PublicApi Test Client A ${ts}` }, ctx.adminToken);
    assert.equal(clientA.status, 200);
    ctx.clientAId = clientA.data.id;

    const clientB = await req('POST', '/clients', { name: `PublicApi Test Client B ${ts}` }, ctx.adminToken);
    assert.equal(clientB.status, 200);
    ctx.clientBId = clientB.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientAId, name: `Agente PublicApi ${ts}` }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentAId = agent.data.agentId;
    ctx.agentAKey = agent.data.key;

    const activate = await req('POST', '/agents/activate', { key: ctx.agentAKey, hardwareId: `HW-PUBAPI-${ts}` });
    assert.equal(activate.status, 200);
    ctx.agentAToken = activate.data.token;
  });
});

describe('API keys — crear/listar/revocar', () => {
  test('POST /clients/:id/api-keys → 201, devuelve el key completo', async () => {
    const created = await req('POST', `/clients/${ctx.clientAId}/api-keys`, { name: 'Integración SAP' }, ctx.adminToken);
    assert.equal(created.status, 201);
    assert.ok(created.data.key, 'debe devolver el key en claro');
    assert.equal(created.data.key.length, 64, 'key de 64 chars hex (256 bits)');
    ctx.apiKeyA = created.data.key;
    ctx.apiKeyAId = created.data.id;
  });

  test('GET /clients/:id/api-keys → lista con prefix, nunca el key completo', async () => {
    const list = await req('GET', `/clients/${ctx.clientAId}/api-keys`, undefined, ctx.adminToken);
    assert.equal(list.status, 200);
    assert.equal(list.data.length, 1);
    assert.ok(list.data[0].key_prefix);
    assert.equal(list.data[0].key, undefined, 'nunca debe traer el key completo en la lista');
  });

  test('key recién creada → 200 en la API pública', async () => {
    const res = await pub('GET', '/public/devices', undefined, ctx.apiKeyA);
    assert.equal(res.status, 200);
  });

  test('sin header X-Api-Key → 401', async () => {
    const res = await pub('GET', '/public/devices');
    assert.equal(res.status, 401);
  });

  test('key inválida → 401', async () => {
    const res = await pub('GET', '/public/devices', undefined, 'a'.repeat(64));
    assert.equal(res.status, 401);
  });

  test('DELETE (revocar) → la key deja de funcionar', async () => {
    const revoke = await req('DELETE', `/clients/${ctx.clientAId}/api-keys/${ctx.apiKeyAId}`, undefined, ctx.adminToken);
    assert.equal(revoke.status, 200);

    const res = await pub('GET', '/public/devices', undefined, ctx.apiKeyA);
    assert.equal(res.status, 401);
  });

  test('revocar de nuevo (ya revocada) → 404', async () => {
    const revoke = await req('DELETE', `/clients/${ctx.clientAId}/api-keys/${ctx.apiKeyAId}`, undefined, ctx.adminToken);
    assert.equal(revoke.status, 404);
  });

  test('crear una key nueva para el resto de los tests (la anterior quedó revocada)', async () => {
    const created = await req('POST', `/clients/${ctx.clientAId}/api-keys`, { name: 'Integración SAP v2' }, ctx.adminToken);
    assert.equal(created.status, 201);
    ctx.apiKeyA = created.data.key;

    const createdB = await req('POST', `/clients/${ctx.clientBId}/api-keys`, { name: 'Otra empresa' }, ctx.adminToken);
    assert.equal(createdB.status, 201);
    ctx.apiKeyB = createdB.data.key;
  });
});

describe('Webhook desde el portal — /clients/:id/webhook', () => {
  test('GET sin configurar aún → 404', async () => {
    const res = await req('GET', `/clients/${ctx.clientAId}/webhook`, undefined, ctx.adminToken);
    assert.equal(res.status, 404);
  });

  test('PUT setea url + events, devuelve el secret (no hace falta API key para configurarlo)', async () => {
    const res = await req('PUT', `/clients/${ctx.clientAId}/webhook`, {
      url: 'https://example.invalid/webhook',
      events: ['reading.created', 'alert.created'],
      active: true,
    }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.url, 'https://example.invalid/webhook');
    assert.deepEqual(res.data.events, ['reading.created', 'alert.created']);
    assert.ok(res.data.secret, 'debe devolver el secret HMAC');
  });

  test('GET después de configurar → 200, mismo contenido', async () => {
    const res = await req('GET', `/clients/${ctx.clientAId}/webhook`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.url, 'https://example.invalid/webhook');
  });

  test('lo configurado por el portal es visible vía la API pública con la key real del cliente', async () => {
    const res = await pub('GET', '/public/webhook', undefined, ctx.apiKeyA);
    assert.equal(res.status, 200);
    assert.equal(res.data.url, 'https://example.invalid/webhook');
  });

  test('events con un valor inválido → 400', async () => {
    const res = await req('PUT', `/clients/${ctx.clientAId}/webhook`, { events: ['no-existe'] }, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('regenerate_secret cambia el secret sin tocar url/events', async () => {
    const before = await req('GET', `/clients/${ctx.clientAId}/webhook`, undefined, ctx.adminToken);
    const res = await req('PUT', `/clients/${ctx.clientAId}/webhook`, { regenerate_secret: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.notEqual(res.data.secret, before.data.secret);
    assert.equal(res.data.url, 'https://example.invalid/webhook', 'url no debe cambiar');
  });
});

describe('API pública — scoping y datos', () => {
  test('sync de una lectura real para el dispositivo de prueba', async () => {
    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceASerial, ip: '192.168.220.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 500, mono_pages: 500, color_pages: 0,
        toner_black: 40, offline: false,
      }],
    }, ctx.agentAToken);
    assert.equal(sync.status, 200);
  });

  test('GET /public/devices con la key del cliente A → ve su dispositivo', async () => {
    const found = await pollUntil(
      () => pub('GET', '/public/devices', undefined, ctx.apiKeyA),
      (r) => r.status === 200 && r.data.some((d: any) => d.serial_number === ctx.deviceASerial)
    );
    assert.ok(found.data.some((d: any) => d.serial_number === ctx.deviceASerial));
  });

  test('GET /public/devices con la key del cliente B → NO ve el dispositivo del cliente A', async () => {
    const res = await pub('GET', '/public/devices', undefined, ctx.apiKeyB);
    assert.equal(res.status, 200);
    assert.equal(res.data.length, 0, 'cliente B no tiene dispositivos propios, y no debe ver los de A');
  });

  test('GET /public/devices/:id/readings scopeado — un id de otro cliente → 404', async () => {
    const devices = await pub('GET', '/public/devices', undefined, ctx.apiKeyA);
    const deviceId = devices.data.find((d: any) => d.serial_number === ctx.deviceASerial).id;

    const own = await pub('GET', `/public/devices/${deviceId}/readings`, undefined, ctx.apiKeyA);
    assert.equal(own.status, 200);
    assert.ok(own.data.length > 0);

    const other = await pub('GET', `/public/devices/${deviceId}/readings`, undefined, ctx.apiKeyB);
    assert.equal(other.status, 404, 'la key de otro cliente no debe poder leer este dispositivo');
  });

  test('paginación: limit=1 devuelve como máximo 1 fila', async () => {
    const res = await pub('GET', '/public/devices?limit=1', undefined, ctx.apiKeyA);
    assert.equal(res.status, 200);
    assert.ok(res.data.length <= 1);
  });
});
