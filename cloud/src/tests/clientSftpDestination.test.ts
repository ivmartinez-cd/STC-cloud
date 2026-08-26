// Destino SFTP por cliente (Fase 19 del gap analysis) — GET/PUT/DELETE
// /clients/:id/sftp-destination. Test de integración contra el stack real.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/clientSftpDestination.test.ts

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

const ts = Date.now();
const ctx = { adminToken: '', clientId: '' };
// NUNCA all-zeros: "00000000-0000-0000-0000-000000000000" es "Cliente de
// Prueba", un cliente real de datos semilla — usar ese UUID como "no existe"
// da un falso 200, hallazgo real de esta pasada (no todas las tablas están
// vacías para ese id, sólo report_closures/etc. lo están).
const NONEXISTENT_CLIENT_ID = crypto.randomUUID();

describe('SFTP destination — fixtures', () => {
  test('Setup: login admin, crear cliente', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `SFTP Dest Test ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;
  });
});

describe('GET /clients/:id/sftp-destination — sin configurar', () => {
  test('cliente nuevo → { configured: false }', async () => {
    const res = await req('GET', `/clients/${ctx.clientId}/sftp-destination`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.configured, false);
  });
});

describe('PUT /clients/:id/sftp-destination — validaciones', () => {
  test('host ausente → 400 (Ajv, required)', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/sftp-destination`, { username: 'u', auth_method: 'password', password: 'x' }, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('host vacío → 400 CON field (pasa Ajv — sin minLength ahí a propósito —, lo agarra la validación real de sftpDestination.ts)', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/sftp-destination`, { host: '', username: 'u', auth_method: 'password', password: 'x' }, ctx.adminToken);
    assert.equal(res.status, 400);
    assert.equal(res.data.field, 'host');
  });

  test('auth_method "password" sin password → 400', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/sftp-destination`, { host: 'h', username: 'u', auth_method: 'password' }, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('cliente inexistente → 404', async () => {
    const res = await req('PUT', `/clients/${NONEXISTENT_CLIENT_ID}/sftp-destination`,
      { host: 'h', username: 'u', auth_method: 'password', password: 'x' }, ctx.adminToken);
    assert.equal(res.status, 404);
  });
});

describe('PUT/GET/DELETE — ciclo completo', () => {
  test('PUT con password válido → 200, vista enmascarada sin la contraseña', async () => {
    const res = await req('PUT', `/clients/${ctx.clientId}/sftp-destination`,
      { host: 'sftp.cliente-test.com', port: 2222, username: 'stc_test', auth_method: 'password', password: 'secreta-123', remote_path: '/reportes' },
      ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.configured, true);
    assert.equal(res.data.host, 'sftp.cliente-test.com');
    assert.equal(res.data.port, 2222);
    assert.equal(res.data.username, 'stc_test');
    assert.equal(res.data.auth_method, 'password');
    assert.equal(res.data.remote_path, '/reportes');
    assert.equal(res.data.password, undefined);
    assert.ok(!JSON.stringify(res.data).includes('secreta-123'), 'la contraseña nunca debe volver en la respuesta');
  });

  test('GET refleja lo guardado, sigue sin exponer la contraseña', async () => {
    const res = await req('GET', `/clients/${ctx.clientId}/sftp-destination`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.configured, true);
    assert.equal(res.data.host, 'sftp.cliente-test.com');
    assert.ok(!JSON.stringify(res.data).includes('secreta-123'));
  });

  test('GET /clients/:id (detalle general) NO expone sftp_destination crudo', async () => {
    const res = await req('GET', `/clients/${ctx.clientId}`, undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.sftp_destination, undefined);
  });

  test('PUT de nuevo cambia a private_key — reemplaza el destino entero', async () => {
    const pk = '-----BEGIN OPENSSH PRIVATE KEY-----\n' + 'x'.repeat(60);
    const res = await req('PUT', `/clients/${ctx.clientId}/sftp-destination`,
      { host: 'sftp.cliente-test.com', username: 'stc_test', auth_method: 'private_key', private_key: pk }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.auth_method, 'private_key');
    assert.equal(res.data.remote_path, '/'); // default — el PUT no mandó remote_path esta vez
  });

  test('DELETE quita el destino — GET vuelve a configured:false', async () => {
    const del = await req('DELETE', `/clients/${ctx.clientId}/sftp-destination`, undefined, ctx.adminToken);
    assert.equal(del.status, 200);
    assert.equal(del.data.ok, true);

    const get = await req('GET', `/clients/${ctx.clientId}/sftp-destination`, undefined, ctx.adminToken);
    assert.equal(get.data.configured, false);
  });

  test('DELETE de un cliente inexistente → 404', async () => {
    const res = await req('DELETE', `/clients/${NONEXISTENT_CLIENT_ID}/sftp-destination`, undefined, ctx.adminToken);
    assert.equal(res.status, 404);
  });
});
