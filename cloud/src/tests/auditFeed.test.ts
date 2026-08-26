// Feed de "Movimientos y cambios" sobre audit_logs (Fase 3 del gap analysis vs
// HP SDS) — Tests de integración, mismo criterio que alerts.test.ts/
// deviceLifecycle.test.ts (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/auditFeed.test.ts

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

async function req(method: string, path: string, body: unknown = {}, token?: string) {
  const isBodyless = method === 'GET' || method === 'HEAD';
  const headers: Record<string, string> = {};
  if (!isBodyless) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: isBodyless ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

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
  agentA1Id: '', agentA1Token: '',
  agentA2Id: '',
  agentBId: '',
  deviceSerial: `SN-AUDIT-${ts}`, deviceId: '',
  viewerUsername: `audit_viewer_${ts}`, viewerPassword: 'AuditViewer1234!',
  viewerToken: '',
};

describe('Audit feed — fixtures', () => {
  test('Setup: login admin + 2 clientes + agentes + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const clientA = await req('POST', '/clients', { name: `Audit Test Client A ${ts}` }, ctx.adminToken);
    ctx.clientAId = clientA.data.id;
    const clientB = await req('POST', '/clients', { name: `Audit Test Client B ${ts}` }, ctx.adminToken);
    ctx.clientBId = clientB.data.id;

    for (const [key, tokenKey, clientId, name] of [
      ['agentA1Id', 'agentA1Token', ctx.clientAId, 'Audit Sede A1'],
      ['agentA2Id', null, ctx.clientAId, 'Audit Sede A2'],
      ['agentBId', null, ctx.clientBId, 'Audit Sede B'],
    ] as const) {
      const agent = await req('POST', '/agents', { clientId, name }, ctx.adminToken);
      const activated = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-${key}-${ts}` });
      (ctx as any)[key] = agent.data.agentId;
      if (tokenKey) (ctx as any)[tokenKey] = activated.data.token;
    }

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.220.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 10, offline: false,
      }],
    }, ctx.agentA1Token);
    assert.equal(sync.status, 200);

    const found = await pollUntil(
      () => req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken),
      (r) => r.data.some((d: any) => d.serial_number === ctx.deviceSerial),
    );
    ctx.deviceId = found.data.find((d: any) => d.serial_number === ctx.deviceSerial).id;
  });
});

describe('Audit feed — DEVICE_MOVED aparece con client_id/target_label/user_username resueltos', () => {
  test('mover el equipo (mismo cliente, otro monitor) genera una fila resuelta', async () => {
    const move = await req('POST', `/devices/${ctx.deviceId}/move`,
      { agentId: ctx.agentA2Id, reason: 'Prueba de auditoría' }, ctx.adminToken);
    assert.equal(move.status, 200);

    const { status, data } = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&action=DEVICE_MOVED`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.items.length, 1);
    const item = data.items[0];
    assert.equal(item.action_label, 'Equipo movido de sede');
    assert.equal(item.category, 'device');
    assert.equal(item.client_id, ctx.clientAId);
    assert.equal(item.client_name, `Audit Test Client A ${ts}`);
    assert.equal(item.target_kind, 'device');
    assert.ok(item.target_label, 'target_label debe resolverse (nombre del equipo)');
    assert.equal(item.user_username, USER);
    assert.ok(item.ip_address);
    assert.ok(item.metadata.from_agent_id === ctx.agentA1Id);
  });
});

describe('Audit feed — filtros', () => {
  test('filtro por action (CSV) sólo devuelve esas acciones', async () => {
    const { status, data } = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&action=DEVICE_MOVED,DEVICE_UPDATED`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.ok(data.items.every((i: any) => i.action === 'DEVICE_MOVED' || i.action === 'DEVICE_UPDATED'));
  });

  test('filtro por category=device incluye DEVICE_MOVED', async () => {
    const { data } = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&category=device`, undefined, ctx.adminToken);
    assert.ok(data.items.some((i: any) => i.action === 'DEVICE_MOVED'));
  });

  test('filtro por category desconocida no matchea nada (no devuelve todo sin filtrar)', async () => {
    const { data } = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&category=no-existe`, undefined, ctx.adminToken);
    assert.equal(data.items.length, 0);
  });

  test('filtro por client_id sólo trae actividad de ese cliente', async () => {
    const inA = await req('GET', `/audit-logs?client_id=${ctx.clientAId}&target_id=${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.ok(inA.data.items.length > 0);
    const inB = await req('GET', `/audit-logs?client_id=${ctx.clientBId}&target_id=${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(inB.data.items.length, 0, 'el equipo es del cliente A, no debe aparecer filtrando por el cliente B');
  });

  test('rango de fechas: "from" en el futuro no devuelve nada', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data } = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&from=${future}`, undefined, ctx.adminToken);
    assert.equal(data.items.length, 0);
  });

  test('total es consistente con la paginación completa', async () => {
    const page1 = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&limit=1&offset=0`, undefined, ctx.adminToken);
    const full = await req('GET', `/audit-logs?target_id=${ctx.deviceId}&limit=200&offset=0`, undefined, ctx.adminToken);
    assert.equal(page1.data.total, full.data.total);
    assert.equal(full.data.items.length, full.data.total);
  });

  test('GET /audit-logs/actions incluye DEVICE_MOVED con count >= 1', async () => {
    const { status, data } = await req('GET', '/audit-logs/actions', undefined, ctx.adminToken);
    assert.equal(status, 200);
    const entry = data.find((a: any) => a.action === 'DEVICE_MOVED');
    assert.ok(entry);
    assert.ok(entry.count >= 1);
    assert.equal(entry.label, 'Equipo movido de sede');
  });
});

// Fase 6 (R5) del gap analysis vs HP SDS señalaba dos hallazgos menores sin
// auditar: RESCAN puntual (triggerScan, no el de un lote) y el cambio de
// versión de agente en heartbeat.
describe('Audit feed — RESCAN puntual y cambio de versión de agente', () => {
  test('POST /agents/:id/scan → AGENT_COMMAND auditado con type=RESCAN', async () => {
    const before = await req('GET', `/audit-logs?target_id=${ctx.agentA2Id}&action=AGENT_COMMAND`, undefined, ctx.adminToken);
    const beforeCount = before.data.total;

    const { status } = await req('POST', `/agents/${ctx.agentA2Id}/scan`, {}, ctx.adminToken);
    assert.equal(status, 200);

    const after = await pollUntil(
      () => req('GET', `/audit-logs?target_id=${ctx.agentA2Id}&action=AGENT_COMMAND`, undefined, ctx.adminToken),
      (r) => r.data.total > beforeCount,
    );
    const row = after.data.items[0];
    assert.equal(row.metadata.type, 'RESCAN');
  });

  test('primer heartbeat con versión → NO audita (no hay versión previa con qué comparar)', async () => {
    const hb = await req('POST', `/agents/${ctx.agentA1Id}/heartbeat`, { system_info: { version: '1.3.0-test-a' } }, ctx.agentA1Token);
    assert.equal(hb.status, 200);

    const { data } = await req('GET', `/audit-logs?target_id=${ctx.agentA1Id}&action=AGENT_VERSION_CHANGED`, undefined, ctx.adminToken);
    assert.equal(data.total, 0);
  });

  test('heartbeat con la MISMA versión otra vez → sigue sin auditar', async () => {
    const hb = await req('POST', `/agents/${ctx.agentA1Id}/heartbeat`, { system_info: { version: '1.3.0-test-a' } }, ctx.agentA1Token);
    assert.equal(hb.status, 200);

    const { data } = await req('GET', `/audit-logs?target_id=${ctx.agentA1Id}&action=AGENT_VERSION_CHANGED`, undefined, ctx.adminToken);
    assert.equal(data.total, 0, 'sin cambio real, no debe generar ruido en cada latido');
  });

  test('heartbeat con versión DISTINTA → AGENT_VERSION_CHANGED con from/to', async () => {
    const hb = await req('POST', `/agents/${ctx.agentA1Id}/heartbeat`, { system_info: { version: '1.3.0-test-b' } }, ctx.agentA1Token);
    assert.equal(hb.status, 200);

    const { data } = await pollUntil(
      () => req('GET', `/audit-logs?target_id=${ctx.agentA1Id}&action=AGENT_VERSION_CHANGED`, undefined, ctx.adminToken),
      (r) => r.data.total > 0,
    );
    assert.equal(data.total, 1, 'una sola fila — el latido anterior con la misma versión no generó una de más');
    assert.equal(data.items[0].metadata.from, '1.3.0-test-a');
    assert.equal(data.items[0].metadata.to, '1.3.0-test-b');
  });
});

async function drainLoginRateLimit(): Promise<void> {
  const { execSync } = await import('node:child_process');
  try {
    execSync('docker exec stc_redis redis-cli DEL "fastify-rate-limit-POST/api/v1/portal/login-172.22.0.1"', { stdio: 'ignore' });
  } catch {
    // best-effort: si no hay docker (CI distinta), el test puede tardar más por el 429 natural
  }
}

describe('Audit feed — login (R5 del gap analysis: "audit logs ausentes para... logins")', () => {
  test('login exitoso → USER_LOGIN_SUCCESS auditado con el propio usuario como target', async () => {
    await drainLoginRateLimit();
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);

    const { data } = await req('GET', '/audit-logs?action=USER_LOGIN_SUCCESS&limit=1', undefined, ctx.adminToken);
    assert.equal(data.items[0].action, 'USER_LOGIN_SUCCESS');
    assert.equal(data.items[0].user_username, USER);
    assert.ok(data.items[0].ip_address);
  });

  test('contraseña incorrecta → USER_LOGIN_FAILED con reason=bad_password (nunca la contraseña en metadata)', async () => {
    await drainLoginRateLimit();
    const login = await req('POST', '/portal/login', { username: USER, password: 'esto-esta-mal' });
    assert.equal(login.status, 401);

    const { data } = await req('GET', '/audit-logs?action=USER_LOGIN_FAILED&limit=1', undefined, ctx.adminToken);
    assert.equal(data.items[0].action, 'USER_LOGIN_FAILED');
    assert.equal(data.items[0].metadata.reason, 'bad_password');
    assert.equal(data.items[0].metadata.username, USER);
    assert.equal(JSON.stringify(data.items[0].metadata).includes('esto-esta-mal'), false);
  });

  test('usuario inexistente → USER_LOGIN_FAILED con reason=unknown_user, sin target_id/user_id (no hay cuenta real)', async () => {
    await drainLoginRateLimit();
    const bogus = `no_existe_${ts}`;
    const login = await req('POST', '/portal/login', { username: bogus, password: 'lo-que-sea' });
    assert.equal(login.status, 401);

    const { data } = await req('GET', '/audit-logs?action=USER_LOGIN_FAILED&limit=1', undefined, ctx.adminToken);
    assert.equal(data.items[0].metadata.reason, 'unknown_user');
    assert.equal(data.items[0].metadata.username, bogus);
    assert.equal(data.items[0].target_id, null);
  });
});

describe('Audit feed — RBAC (sólo admin/operator)', () => {
  test('Setup: crear client_viewer atado al cliente A', async () => {
    const created = await req('POST', '/portal/users', {
      username: ctx.viewerUsername, password: ctx.viewerPassword, role: 'client_viewer', client_id: ctx.clientAId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: ctx.viewerUsername, password: ctx.viewerPassword });
    assert.equal(login.status, 200);
    ctx.viewerToken = login.data.token;
  });

  test('GET /audit-logs → 403 para client_viewer', async () => {
    const { status } = await req('GET', '/audit-logs', undefined, ctx.viewerToken);
    assert.equal(status, 403);
  });

  test('GET /audit-logs/actions → 403 para client_viewer', async () => {
    const { status } = await req('GET', '/audit-logs/actions', undefined, ctx.viewerToken);
    assert.equal(status, 403);
  });

  test('admin/operator sí pueden (regresión)', async () => {
    const { status } = await req('GET', '/audit-logs', undefined, ctx.adminToken);
    assert.equal(status, 200);
  });
});
