// Acciones remotas en bloque (Fase 4.6 del gap analysis vs HP SDS,
// re-comparación 24/08/2026) — e2e con el ciclo REAL: crear lote → el
// worker (tick 60s) crea agent_commands → un "agente" simulado por
// heartbeat recibe el comando y devuelve el resultado → el worker cierra
// el lote como completed / completed_with_errors.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/remoteActions.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { aggregateStatus, targetKindOf } from '../modules/remote-actions/domain/entities/remote-action-batch';

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

async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 120_000, stepMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, stepMs));
  } while (Date.now() < deadline);
  return last;
}

describe('Dominio puro — aggregateStatus', () => {
  test('pendiente/sent/null → sigue sent; todos success → completed; algún error → with_errors', () => {
    assert.equal(aggregateStatus([null, 'success']), 'sent');
    assert.equal(aggregateStatus(['pending', 'success']), 'sent');
    assert.equal(aggregateStatus(['success', 'success']), 'completed');
    assert.equal(aggregateStatus(['success', 'error']), 'completed_with_errors');
  });
});

describe('Dominio puro — targetKindOf', () => {
  test('RESTART_PRINTER apunta a equipo; el resto apunta a agente', () => {
    assert.equal(targetKindOf('RESTART_PRINTER'), 'device');
    for (const a of ['RESCAN', 'FORCE_SCAN', 'RESTART', 'FORCE_UPDATE'] as const) {
      assert.equal(targetKindOf(a), 'agent');
    }
  });
});

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', agentId: '', agentToken: '', batchId: '' };

describe('Acciones remotas — e2e con ciclo real de heartbeat', () => {
  test('setup: cliente + agente activado', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const client = await req('POST', '/clients', { name: `RemoteActions Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente RemoteActions ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-RA-${ts}` });
    ctx.agentToken = activate.data.token;
  });

  test('agente revocado/inexistente en el lote → 400', async () => {
    const res = await req('POST', '/remote-actions', {
      action: 'RESCAN', agent_ids: ['00000000-0000-0000-0000-000000000000'],
    }, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('crear lote inmediato → número legible y estado scheduled', async () => {
    const res = await req('POST', '/remote-actions', {
      action: 'RESCAN', name: `Lote QA ${ts}`, agent_ids: [ctx.agentId],
    }, ctx.adminToken);
    assert.equal(res.status, 201);
    assert.ok(res.data.number >= 1000);
    assert.equal(res.data.status, 'scheduled');
    ctx.batchId = res.data.id;
  });

  test('el worker lo despacha → comando creado y lote sent (tick real ≤120s)', async () => {
    const sent = await pollUntil(
      () => req('GET', `/remote-actions/${ctx.batchId}`, undefined, ctx.adminToken),
      (r) => r.data.status === 'sent' && r.data.items?.[0]?.command_id,
    );
    assert.equal(sent.data.status, 'sent');
    assert.ok(sent.data.items[0].command_id, 'debe tener el agent_command vinculado');
  });

  test('el "agente" recibe el comando por heartbeat y devuelve éxito → lote completed', async () => {
    // 1er heartbeat: recibe el comando pendiente
    const hb1 = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {}, ctx.agentToken);
    assert.equal(hb1.status, 200);
    const command = (hb1.data.commands ?? []).find((c: any) => c.type === 'RESCAN');
    assert.ok(command, 'el heartbeat debe entregar el comando del lote');

    // 2do heartbeat: reporta el resultado (lo que haría CommandHandler)
    const hb2 = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {
      commandResults: [{ id: command.id, type: 'RESCAN', status: 'success', result: { ok: true } }],
    }, ctx.agentToken);
    assert.equal(hb2.status, 200);

    const done = await pollUntil(
      () => req('GET', `/remote-actions/${ctx.batchId}`, undefined, ctx.adminToken),
      (r) => r.data.status === 'completed',
    );
    assert.equal(done.data.status, 'completed');
    assert.ok(done.data.completed_at);
    assert.equal(done.data.items[0].command_status, 'success');
  });

  test('lote futuro se puede cancelar; uno despachado no', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const created = await req('POST', '/remote-actions', {
      action: 'FORCE_SCAN', agent_ids: [ctx.agentId], scheduled_at: future,
    }, ctx.adminToken);
    assert.equal(created.status, 201);
    const cancel = await req('POST', `/remote-actions/${created.data.id}/cancel`, {}, ctx.adminToken);
    assert.equal(cancel.status, 200);

    const cancelSent = await req('POST', `/remote-actions/${ctx.batchId}/cancel`, {}, ctx.adminToken);
    assert.equal(cancelSent.status, 409);
  });

  test('el listado muestra el lote con total de elementos', async () => {
    const res = await req('GET', '/remote-actions', undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    const row = res.data.items.find((b: any) => b.id === ctx.batchId);
    assert.equal(row.total_items, 1);
  });
});

describe('RESTART_PRINTER — destino por equipo (agente v1.2.0)', () => {
  const devSerial = `SN-RA-${ts}`;
  let deviceId = '';
  let batchId = '';

  test('setup: un dispositivo real dentro del agente ya activado', async () => {
    const s = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: devSerial, ip: '192.168.248.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 10, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(s.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    deviceId = devices.data.find((d: any) => d.serial_number === devSerial).id;
  });

  test('con agent_ids en vez de device_ids → 400 (targetKind equivocado)', async () => {
    const res = await req('POST', '/remote-actions', { action: 'RESTART_PRINTER', agent_ids: [ctx.agentId] }, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('equipo inexistente → 400', async () => {
    const res = await req('POST', '/remote-actions', {
      action: 'RESTART_PRINTER', device_ids: ['00000000-0000-0000-0000-000000000000'],
    }, ctx.adminToken);
    assert.equal(res.status, 400);
  });

  test('crear lote por device_ids → item trae agent_id + device_ip resueltos', async () => {
    const res = await req('POST', '/remote-actions', {
      action: 'RESTART_PRINTER', name: `Reinicio impresora QA ${ts}`, device_ids: [deviceId],
    }, ctx.adminToken);
    assert.equal(res.status, 201);
    batchId = res.data.id;
    const detail = await req('GET', `/remote-actions/${batchId}`, undefined, ctx.adminToken);
    assert.equal(detail.data.items[0].agent_id, ctx.agentId);
    assert.equal(detail.data.items[0].device_ip, '192.168.248.10');
    assert.equal(detail.data.items[0].device_id, deviceId);
  });

  test('el worker despacha con payload {ip} → el heartbeat lo entrega con esa IP', async () => {
    const sent = await pollUntil(
      () => req('GET', `/remote-actions/${batchId}`, undefined, ctx.adminToken),
      (r) => r.data.status === 'sent' && r.data.items?.[0]?.command_id,
    );
    assert.equal(sent.data.status, 'sent');

    const hb = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {}, ctx.agentToken);
    const command = (hb.data.commands ?? []).find((c: any) => c.type === 'RESTART_PRINTER');
    assert.ok(command, 'el heartbeat debe entregar el comando');
    assert.equal(command.payload?.ip, '192.168.248.10', 'el payload debe llevar la IP del equipo, no la del agente');
  });

  test('simular un fallo real del agente (sin permiso de escritura) → lote completed_with_errors', async () => {
    const detail = await req('GET', `/remote-actions/${batchId}`, undefined, ctx.adminToken);
    const commandId = detail.data.items[0].command_id;
    const hb = await req('POST', `/agents/${ctx.agentId}/heartbeat`, {
      commandResults: [{
        id: commandId, type: 'RESTART_PRINTER', status: 'error',
        result: { error: 'la credencial SNMP configurada no tiene permiso de escritura en este equipo' },
      }],
    }, ctx.agentToken);
    assert.equal(hb.status, 200);
    const done = await pollUntil(
      () => req('GET', `/remote-actions/${batchId}`, undefined, ctx.adminToken),
      (r) => r.data.status !== 'sent',
    );
    assert.equal(done.data.status, 'completed_with_errors');
    assert.equal(done.data.items[0].command_status, 'error');
  });

  test('RBAC: client_viewer no puede crear lotes', async () => {
    const username = `ra_viewer_${ts}`;
    await req('POST', '/portal/users', { username, password: 'RaViewer1234!', role: 'client_viewer', client_id: ctx.clientId }, ctx.adminToken);
    const login = await req('POST', '/portal/login', { username, password: 'RaViewer1234!' });
    const res = await req('POST', '/remote-actions', { action: 'RESTART_PRINTER', device_ids: [deviceId] }, login.data.token);
    assert.equal(res.status, 403);
    const list = await req('GET', '/remote-actions', undefined, login.data.token);
    assert.equal(list.status, 403);
  });
});
