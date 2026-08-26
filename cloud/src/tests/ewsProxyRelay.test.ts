// Relay Redis multi-réplica del proxy EWS (Fase 15 del gap analysis) — e2e
// contra el stack Docker real, simulando "otra réplica" con
// `docker exec stc_redis redis-cli publish ...`, mismo criterio que ya usa
// `observability.test.ts` para el pub/sub de broadcasts de portal. Cubre
// justo lo que `portalAgentEws.test.ts` NO puede cubrir corriendo un solo
// proceso: los tres canales del relay (`stc:ws:ews-push`,
// `stc:ws:ews-result`) tal como los vería una réplica vecina.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/ewsProxyRelay.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import WebSocket from 'ws';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const WS_BASE = API.replace(/^http/, 'ws').replace(/\/api\/v1$/, '/ws');
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
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

function redisPublish(channel: string, payload: unknown): void {
  const json = JSON.stringify(payload).replace(/'/g, `'\\''`);
  execSync(`docker exec stc_redis redis-cli publish ${channel} '${json}'`);
}

const ts = Date.now();
const ctx = {
  adminToken: '', clientId: '', agentId: '', agentKey: '', agentToken: '',
  deviceSerial: `SN-EWSRELAY-${ts}`, deviceId: '',
};

describe('Relay EWS proxy — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + sync + habilitar flag', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `EWS Relay Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente EWS Relay ${ts}` }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;
    ctx.agentKey = agent.data.key;

    const activate = await req('POST', '/agents/activate', { key: ctx.agentKey, hardwareId: `HW-EWSRELAY-${ts}` });
    assert.equal(activate.status, 200);
    ctx.agentToken = activate.data.token;

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.240.30', brand: 'hp',
        time: new Date().toISOString(), total_pages: 50, mono_pages: 50, color_pages: 0, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device);
    ctx.deviceId = device.id;

    const enable = await req('PUT', `/agents/${ctx.agentId}/remote-ews`, { enabled: true }, ctx.adminToken);
    assert.equal(enable.status, 200);
  });
});

describe('Relay EWS proxy — push por Redis (réplica vecina entrega el comando)', () => {
  let socket: WebSocket;
  const received: any[] = [];

  after(() => socket?.close());

  test('setup: conectar el agente falso (registra el socket en ESTA réplica)', async () => {
    socket = new WebSocket(WS_BASE, { headers: { Authorization: `Bearer ${ctx.agentToken}` } });
    socket.on('message', (raw: Buffer) => received.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
  });

  test('un publish en stc:ws:ews-push llega al socket local del agente', async () => {
    const commandId = `relay-cmd-${crypto.randomUUID()}`;
    redisPublish('stc:ws:ews-push', { agentId: ctx.agentId, commandId, payload: { ip: '10.0.0.1', path: '/relay-test', method: 'GET' } });

    await new Promise((r) => setTimeout(r, 800));
    const hit = received.find((m) => m.type === 'command' && m.id === commandId);
    assert.ok(hit, 'el pedido de push relayeado por Redis debe llegar al socket del agente conectado a esta réplica');
    assert.equal(hit.commandType, 'EWS_PROXY');
    assert.equal(hit.payload.path, '/relay-test');
  });
});

describe('Relay EWS proxy — resultado por Redis (réplica vecina entrega la respuesta)', () => {
  let socket: WebSocket;

  after(() => socket?.close());

  test('setup: conectar el agente falso, responde SÓLO por relay Redis (nunca por su propio WS)', async () => {
    socket = new WebSocket(WS_BASE, { headers: { Authorization: `Bearer ${ctx.agentToken}` } });
    socket.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'command' || msg.commandType !== 'EWS_PROXY') return;
      // Publica DIRECTO al canal de resultado — simula que el agente respondió
      // a una réplica vecina, nunca al socket que abrió este test.
      redisPublish('stc:ws:ews-result', {
        commandId: msg.id,
        ok: true,
        value: { status: 200, headers: {}, bodyBase64: Buffer.from('<html>RELAY-OK</html>').toString('base64'), truncated: false },
      });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
  });

  test('la request HTTP se resuelve con el resultado relayeado, no con un local', async () => {
    const res = await req('POST', `/agents/${ctx.agentId}/ews-proxy`, { device_id: ctx.deviceId, path: '/relay-result' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 200);
    assert.equal(Buffer.from(res.data.body_base64, 'base64').toString('utf8'), '<html>RELAY-OK</html>');
  });
});

describe('Relay EWS proxy — desconexión relayeada (réplica vecina avisa que el agente se cayó)', () => {
  let socket: WebSocket;

  after(() => socket?.close());

  test('setup: conectar el agente falso, nunca responde (deja la request colgada)', async () => {
    socket = new WebSocket(WS_BASE, { headers: { Authorization: `Bearer ${ctx.agentToken}` } });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
  });

  test('un publish {kind:"disconnect"} rechaza la request en vuelo con el mensaje de desconexión', async () => {
    const pending = req('POST', `/agents/${ctx.agentId}/ews-proxy`, { device_id: ctx.deviceId, path: '/relay-disconnect' }, ctx.adminToken);
    await new Promise((r) => setTimeout(r, 300)); // dar tiempo a que la request quede esperando el resultado
    redisPublish('stc:ws:ews-result', { kind: 'disconnect', agentId: ctx.agentId });

    const res = await pending;
    assert.equal(res.status, 502);
    assert.match(res.data.error, /desconect/i);
  });
});
