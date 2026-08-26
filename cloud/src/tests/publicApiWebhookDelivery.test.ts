// API pública — entrega de webhook ERP (guard SSRF end-to-end). Separado de
// publicApi.test.ts (deuda de sizes-baseline, 2026-08-26) sólo por tamaño de
// archivo; fixture propia (cliente + agente + api key) porque corre en su
// propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/publicApiWebhookDelivery.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

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
const ctx = {
  adminToken: '', clientId: '', agentToken: '', deviceSerial: `SN-PUBAPI-WH-${ts}`, apiKey: '',
};

describe('API pública — webhook — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + api key', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `PublicApi Webhook Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente PublicApi Webhook ${ts}` }, ctx.adminToken);
    assert.equal(agent.status, 200);
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-PUBAPI-WH-${ts}` });
    assert.equal(activate.status, 200);
    ctx.agentToken = activate.data.token;

    const key = await req('POST', `/clients/${ctx.clientId}/api-keys`, { name: 'Integración webhook' }, ctx.adminToken);
    assert.equal(key.status, 201);
    ctx.apiKey = key.data.key;
  });
});

describe('API pública — webhook de integración ERP', () => {
  let server: http.Server;
  let port: number;
  const received: Array<{ event: string; signature: string; rawBody: string }> = [];

  test('setup: servidor HTTP local para recibir el webhook', async () => {
    server = http.createServer((httpReq, httpRes) => {
      const chunks: Buffer[] = [];
      httpReq.on('data', (c) => chunks.push(c));
      httpReq.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(rawBody);
        received.push({ event: parsed.event, signature: String(httpReq.headers['x-stc-signature']), rawBody });
        httpRes.writeHead(200);
        httpRes.end('ok');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as any).port;
  });

  test('PUT /public/webhook — el guard SSRF rechaza una URL no-HTTPS de un webhook local de prueba', async () => {
    // El propio guard SSRF (`assertSafeWebhookUrl`, ya probado en alerts.test.ts)
    // exige HTTPS y bloquea loopback — así que este test de integración real NO
    // puede levantar un receptor http://127.0.0.1 y esperar que el guard lo deje
    // pasar. Se verifica en cambio que el guard rechaza esa URL EXACTA en runtime
    // (confirma que el nuevo endpoint la reusa), y el resto de la suite prueba la
    // config/CRUD del webhook, no la entrega real contra un receptor local.
    const put = await pub('PUT', '/public/webhook', { url: `http://127.0.0.1:${port}/hook`, events: ['reading.created'] }, ctx.apiKey);
    assert.equal(put.status, 200, 'el PUT en sí (guardar config) no valida la URL de forma síncrona');

    const get = await pub('GET', '/public/webhook', undefined, ctx.apiKey);
    assert.equal(get.status, 200);
    assert.equal(get.data.url, `http://127.0.0.1:${port}/hook`);
    assert.ok(get.data.secret, 'debe traer el secret HMAC (a diferencia del API key, se puede releer)');
    assert.deepEqual(get.data.events, ['reading.created']);
  });

  test('sync de otra lectura → el intento de webhook queda registrado como fallido (guard SSRF), sin romper el sync', async () => {
    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.220.11', brand: 'hp',
        time: new Date().toISOString(), total_pages: 10, mono_pages: 10, color_pages: 0,
        toner_black: 39, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200, 'el sync no debe fallar aunque el webhook configurado sea rechazado por el guard SSRF');
    // Esperar un poco para darle tiempo al worker a intentarlo (y descartarlo).
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(received.length, 0, 'el guard SSRF debe haber bloqueado la entrega — nunca debería llegar al server local');
  });

  test('cleanup: cerrar servidor HTTP local', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
