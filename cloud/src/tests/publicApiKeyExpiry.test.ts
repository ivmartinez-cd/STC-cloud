// API pública — expiración de API keys. Separado de publicApi.test.ts (deuda
// de sizes-baseline, 2026-08-26) sólo por tamaño de archivo; fixture propia
// porque estos casos sólo necesitan un cliente, no el agente/dispositivo del
// resto de la suite.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/publicApiKeyExpiry.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import knexLib from 'knex';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
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

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', apiKeyExpiring: '', apiKeyExpiringId: '' };

// Forzar `expires_at` al pasado no es posible por API (nadie debería poder
// mandar una fecha arbitraria), así que se escribe directo — mismo patrón
// que publicApi.test.ts/inventoryFields.test.ts.
const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.ALERTS_TEST_DB_HOST || 'localhost',
    port: Number(process.env.ALERTS_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});
after(async () => { await rawDb.destroy().catch(() => {}); });

describe('API keys — expiración — fixtures', () => {
  test('Setup: login admin, crear cliente', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `PublicApi Expiry Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;
  });
});

describe('API keys — expiración', () => {
  test('sin expires_in_days → expires_at null (comportamiento de siempre)', async () => {
    const created = await req('POST', `/clients/${ctx.clientId}/api-keys`, { name: 'Sin vencimiento' }, ctx.adminToken);
    assert.equal(created.status, 201);
    const list = await req('GET', `/clients/${ctx.clientId}/api-keys`, undefined, ctx.adminToken);
    const row = list.data.find((k: any) => k.id === created.data.id);
    assert.equal(row?.expires_at, null);
  });

  test('expires_in_days fuera de rango (0, 3651, no-entero) → 400, no crea nada', async () => {
    for (const bad of [0, 3651, 1.5, 'x']) {
      const { status } = await req('POST', `/clients/${ctx.clientId}/api-keys`, { name: 'Rango inválido', expires_in_days: bad }, ctx.adminToken);
      assert.equal(status, 400, String(bad));
    }
  });

  test('expires_in_days=1 → 201, expires_at es ~mañana', async () => {
    const created = await req('POST', `/clients/${ctx.clientId}/api-keys`, { name: 'Key con vencimiento', expires_in_days: 1 }, ctx.adminToken);
    assert.equal(created.status, 201);
    ctx.apiKeyExpiring = created.data.key;
    ctx.apiKeyExpiringId = created.data.id;

    const list = await req('GET', `/clients/${ctx.clientId}/api-keys`, undefined, ctx.adminToken);
    const row = list.data.find((k: any) => k.id === ctx.apiKeyExpiringId);
    assert.ok(row.expires_at, 'debe tener expires_at seteado');
    const diffHours = (new Date(row.expires_at).getTime() - Date.now()) / (60 * 60 * 1000);
    assert.ok(diffHours > 23 && diffHours <= 24.1, `expires_at debe ser ~24hs a futuro, dio ${diffHours}h`);
  });

  test('key con expires_in_days=1 todavía funciona hoy', async () => {
    const res = await pub('GET', '/public/devices', undefined, ctx.apiKeyExpiring);
    assert.equal(res.status, 200);
  });

  test('key ya vencida (forzado directo en DB) → 401 en la API pública, aunque nunca se haya revocado', async () => {
    await rawDb('api_keys').where({ id: ctx.apiKeyExpiringId }).update({ expires_at: new Date(Date.now() - 60_000) });
    const res = await pub('GET', '/public/devices', undefined, ctx.apiKeyExpiring);
    assert.equal(res.status, 401);

    const list = await req('GET', `/clients/${ctx.clientId}/api-keys`, undefined, ctx.adminToken);
    const row = list.data.find((k: any) => k.id === ctx.apiKeyExpiringId);
    assert.equal(row.revoked_at, null, 'una key vencida no se revoca — la fila queda intacta para que el admin la vea y decida');
  });
});
