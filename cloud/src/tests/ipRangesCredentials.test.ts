// Hostname (point lookup) + credenciales SNMP por rango (§2.1/§2.3 gap
// analysis, último ítem de Fase 1) — Tests de integración, mismo criterio
// que e2e.test.ts/rbac.test.ts/reports.test.ts (backend corriendo en
// localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/ipRangesCredentials.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
const ctx = {
  adminToken: '',
  clientId: '',
  agentId: '', agentToken: '',
  credentialId: '',
};

describe('ip_ranges + snmp_credentials — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `IpRangesCred Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: 'IpRangesCred Test Agent' }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;

    const activated = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `IPRC-HW-${ts}` });
    assert.equal(activated.status, 200);
    ctx.agentToken = activated.data.token;
  });

  test('Setup: crear una credencial SNMP real para usar en credential_ids', async () => {
    const put = await req('PUT', `/agents/${ctx.agentId}/snmp-credentials`,
      { credentials: [{ version: 'v2c', community: 'public-iprc' }] }, ctx.adminToken);
    assert.equal(put.status, 200);

    const get = await req('GET', `/agents/${ctx.agentId}/snmp-credentials`, undefined, ctx.adminToken);
    assert.equal(get.status, 200);
    assert.equal(get.data.credentials.length, 1);
    ctx.credentialId = get.data.credentials[0].id;
    assert.ok(ctx.credentialId);
  });
});

describe('hostname (point lookup)', () => {
  test('PUT con un spec {hostname} válido → 200, no lo resuelve (no hay validación de existencia cloud-side)', async () => {
    const { status } = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [{ label: 'Impresora pineada', hostname: 'printer-que-no-existe.local' }],
    }, ctx.adminToken);
    assert.equal(status, 200);
  });

  test('GET /agents/:id (portal) muestra el spec crudo con hostname', async () => {
    const { data } = await req('GET', `/agents/${ctx.agentId}`, undefined, ctx.adminToken);
    const spec = data.config.ip_ranges.find((r: any) => r.hostname === 'printer-que-no-existe.local');
    assert.ok(spec, 'El spec de hostname debe verse crudo en el portal');
    assert.equal(spec.label, 'Impresora pineada');
  });

  test('heartbeat trae el hostname en ip_hosts (campo nuevo, aditivo)', async () => {
    const hb = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {}, ctx.agentToken);
    assert.equal(hb.status, 200);
    assert.ok(Array.isArray(hb.data.config.ip_hosts), 'ip_hosts debe existir en el heartbeat');
    const host = hb.data.config.ip_hosts.find((h: any) => h.hostname === 'printer-que-no-existe.local');
    assert.ok(host, 'el hostname debe viajar en ip_hosts');
  });

  test('PUT con hostname inválido → 400', async () => {
    const { status } = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [{ hostname: '' }],
    }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('PUT con hostname Y cidr a la vez → 400 (mutuamente excluyentes)', async () => {
    const { status } = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [{ hostname: 'algo.local', cidr: '10.0.0.0/24' }],
    }, ctx.adminToken);
    assert.equal(status, 400);
  });
});

describe('credenciales SNMP por rango', () => {
  test('PUT con credential_ids apuntando a una credencial real → el heartbeat la incluye en el rango compilado', async () => {
    const put = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [{ start: '10.50.0.1', end: '10.50.0.5', credential_ids: [ctx.credentialId] }],
    }, ctx.adminToken);
    assert.equal(put.status, 200);

    const hb = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {}, ctx.agentToken);
    assert.equal(hb.status, 200);
    const range = hb.data.config.ip_ranges.find((r: any) => r.start === '10.50.0.1');
    assert.ok(range, 'el rango debe estar compilado en el heartbeat');
    assert.deepEqual(range.credential_ids, [ctx.credentialId]);
  });

  test('PUT con credential_ids apuntando a un id INEXISTENTE → fail-open: el heartbeat manda el rango SIN credential_ids', async () => {
    const put = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [{ start: '10.51.0.1', end: '10.51.0.5', credential_ids: ['00000000-0000-0000-0000-000000000000'] }],
    }, ctx.adminToken);
    assert.equal(put.status, 200);

    const hb = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {}, ctx.agentToken);
    const range = hb.data.config.ip_ranges.find((r: any) => r.start === '10.51.0.1');
    assert.ok(range, 'el rango debe estar compilado igual (fail-open, no se descarta)');
    assert.equal(range.credential_ids, undefined, 'credential_ids colgante debe venir AUSENTE, no una lista vacía');
  });

  test('rangos superpuestos con credential_ids distintos → warning no bloqueante al guardar', async () => {
    const put = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [
        { label: 'A', start: '10.52.0.1', end: '10.52.0.50', credential_ids: [ctx.credentialId] },
        { label: 'B', cidr: '10.52.0.0/24' },
      ],
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.ok(put.data.warnings.some((w: string) => w.includes('superpon')), 'debe avisar del solapamiento con credenciales distintas');
  });

  test('rangos superpuestos con las MISMAS credenciales → sin warning (no es falso positivo)', async () => {
    const put = await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [
        { label: 'A', start: '10.53.0.1', end: '10.53.0.50' },
        { label: 'B', cidr: '10.53.0.0/24' },
      ],
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.equal(put.data.warnings.filter((w: string) => w.includes('superpon')).length, 0);
  });

  test('borrar una credencial referenciada por un rango → warning al guardar la lista de credenciales', async () => {
    // Deja un rango referenciando ctx.credentialId (ya seteado en el test de fail-open... lo re-seteamos acá para no depender del orden)
    await req('PUT', `/agents/${ctx.agentId}/config`, {
      ip_ranges: [{ start: '10.54.0.1', end: '10.54.0.5', credential_ids: [ctx.credentialId] }],
    }, ctx.adminToken);

    // Reemplaza la lista de credenciales SIN la que el rango de arriba referencia (queda vacía).
    const put = await req('PUT', `/agents/${ctx.agentId}/snmp-credentials`, { credentials: [] }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.ok(put.data.warnings.some((w: string) => w.includes('rango')), 'debe avisar que un rango quedó referenciando una credencial borrada');
  });
});
