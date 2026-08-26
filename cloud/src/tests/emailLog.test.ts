// Auditoría de correo (Fase 4.4 del gap analysis vs HP SDS, re-comparación
// 24/08/2026) — e2e contra el stack real: el entorno de test NO tiene SMTP
// configurado, así que cada notificación debe quedar registrada como
// `skipped_no_transport` — "no se mandó nada" también se audita.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/emailLog.test.ts

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

/* eslint-disable @typescript-eslint/no-explicit-any */
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

async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 20_000, stepMs = 1_000): Promise<T> {
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
const ctx = { adminToken: '', clientId: '', agentToken: '', deviceSerial: `SN-EMAILLOG-${ts}` };

function sync(agentToken: string, serial: string, ip: string, extra: Record<string, unknown> = {}) {
  return req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: serial, ip, brand: 'hp',
      time: new Date().toISOString(), total_pages: 100, offline: false, ...extra,
    }],
  }, agentToken);
}

describe('Auditoría de correo — e2e', () => {
  test('setup: login + cliente con email de notificación', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const client = await req('POST', '/clients', { name: `EmailLog Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
    const upd = await req('PUT', `/clients/${ctx.clientId}`, {
      notification_email: `emaillog_${ts}@test.local`,
    }, ctx.adminToken);
    assert.equal(upd.status, 200);
  });

  test('setup: agente + dispositivo', async () => {
    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente EmailLog ${ts}` }, ctx.adminToken);
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-EMAILLOG-${ts}` });
    ctx.agentToken = activate.data.token;
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.246.10', { toner_black: 80 });
    assert.equal(s.status, 200);
  });

  test('alerta crítica → el intento de email queda auditado (skipped_no_transport)', async () => {
    const s = await sync(ctx.agentToken, ctx.deviceSerial, '192.168.246.10', { toner_black: 3 });
    assert.equal(s.status, 200);

    const found = await pollUntil(
      () => req('GET', `/email-log?client_id=${ctx.clientId}&event=alert.created`, undefined, ctx.adminToken),
      (r) => r.data.items?.length >= 1,
    );
    assert.ok(found.data.items.length >= 1, 'debe existir la fila de auditoría del email de la alerta');
    const row = found.data.items[0];
    assert.equal(row.status, 'skipped_no_transport');
    assert.equal(row.recipient, `emaillog_${ts}@test.local`);
    assert.ok(row.metadata?.alert_id);
  });

  test('filtros: por estado y búsqueda por destinatario', async () => {
    const byStatus = await req('GET', `/email-log?client_id=${ctx.clientId}&status=sent`, undefined, ctx.adminToken);
    assert.equal(byStatus.status, 200);
    assert.equal(byStatus.data.items.length, 0, 'sin SMTP nada figura como sent');
    const byQ = await req('GET', `/email-log?q=emaillog_${ts}`, undefined, ctx.adminToken);
    assert.ok(byQ.data.items.length >= 1);
  });

  test('status inválido → 400', async () => {
    const res = await req('GET', '/email-log?status=no_existe', undefined, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('GET /email-log/summary — sinSmtp cuadra con el intento auditado, reintentos es siempre 0', async () => {
    const res = await req('GET', `/email-log/summary?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.sinSmtp, 1, 'el único intento de este cliente en la ventana quedó skipped_no_transport');
    assert.equal(res.data.entregados, 0);
    assert.equal(res.data.sinDestinatario, 0, 'el cliente sí tiene notification_email configurado');
    assert.equal(res.data.reintentos, 0, 'no existe cola de reintentos — el número real es 0, no un placeholder');
    assert.equal(res.data.intentos, res.data.entregados + res.data.sinDestinatario + res.data.sinSmtp);
  });

  test('GET /email-log/summary — clientesSinContacto cuenta contra la cartera global, no la ventana', async () => {
    const sinContacto = await req('POST', '/clients', { name: `EmailLog SinContacto ${ts}` }, ctx.adminToken);
    const res = await req('GET', '/email-log/summary', undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.clientesSinContacto >= 1, 'el cliente recién creado sin notification_email debe contar');
    assert.ok(res.data.clientesTotal >= res.data.clientesSinContacto);
    void sinContacto;
  });
});
