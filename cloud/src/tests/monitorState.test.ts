// Estado de monitoreo granular (Fase 5 del gap analysis vs HP SDS) — Tests de
// integración, mismo criterio que alerts.test.ts/deviceLifecycle.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/monitorState.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  clientId: '', agentId: '', agentToken: '',
  deviceSerial: `SN-MONSTATE-${ts}`, deviceId: '',
};

describe('Estado de monitoreo — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `MonitorState Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente MonitorState ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-MONSTATE-${ts}` });
    ctx.agentToken = activate.data.token;

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.240.10', brand: 'hp',
        time: new Date().toISOString(), total_pages: 100, toner_black: 80, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device);
    ctx.deviceId = device.id;
    assert.equal(device.monitor_state, 'full', 'default de la migración');
  });
});

describe('Estado de monitoreo — validaciones del endpoint', () => {
  test('state inválido → 400', async () => {
    const { status } = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'no-existe' }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('sin state → 400', async () => {
    const { status } = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, {}, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('dispositivo inexistente → 404', async () => {
    const { status } = await req('PUT', '/devices/00000000-0000-0000-0000-000000000000/monitor-state', { state: 'disabled' }, ctx.adminToken);
    assert.equal(status, 404);
  });
});

describe('Estado de monitoreo — disabled: no crecen las lecturas', () => {
  test('sync con disabled=true no inserta fila en readings, sólo actualiza last_seen', async () => {
    const set = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'disabled', reason: 'Prueba automatizada' }, ctx.adminToken);
    assert.equal(set.status, 200);
    assert.equal(set.data.monitor_state, 'disabled');

    const before = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    const countBefore = before.data.length;

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.240.10', brand: 'hp',
        time: new Date(Date.now() + 1000).toISOString(), total_pages: 500, toner_black: 5, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);
    await new Promise((r) => setTimeout(r, 1000));

    const after = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    assert.equal(after.data.length, countBefore, 'disabled no debe agregar filas a readings');

    const device = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(Number(device.data.total_pages), 100, 'disabled no debe actualizar contadores (quedó en el valor previo)');
  });
});

describe('Estado de monitoreo — reports_only: no genera alertas', () => {
  test('tóner crítico con reports_only → NO se abre toner_black_critical', async () => {
    const set = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'reports_only' }, ctx.adminToken);
    assert.equal(set.status, 200);

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.240.10', brand: 'hp',
        time: new Date(Date.now() + 2000).toISOString(), total_pages: 600, toner_black: 3, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    // Da tiempo al worker BullMQ a procesar (si fuera a abrir la alerta, ya lo habría hecho).
    await new Promise((r) => setTimeout(r, 1500));

    const alerts = await req('GET', `/alerts?device_id=${ctx.deviceId}&type=toner_black_critical`, undefined, ctx.adminToken);
    assert.equal(alerts.data.length, 0, 'reports_only no debe generar alertas de tóner');

    // Pero SÍ debe actualizar contadores/lecturas — reports_only es lossless.
    const device = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(Number(device.data.total_pages), 600, 'reports_only sí debe reflejar contadores nuevos');
  });
});

describe('Estado de monitoreo — supplies_only: no factura', () => {
  test('el equipo no aparece en el preview del cierre del mes actual', async () => {
    const set = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'supplies_only' }, ctx.adminToken);
    assert.equal(set.status, 200);

    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const preview = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=${period}`, undefined, ctx.adminToken);
    assert.equal(preview.status, 200);
    assert.ok(
      !preview.data.lines.some((l: any) => l.serial_number === ctx.deviceSerial),
      'supplies_only no debe facturar — no debe aparecer en el preview del cierre'
    );
  });

  test('sí genera alertas de tóner (alertable, aunque no sea billable)', async () => {
    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.240.10', brand: 'hp',
        time: new Date(Date.now() + 3000).toISOString(), total_pages: 700, toner_black: 3, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const alerts = await pollUntil(
      () => req('GET', `/alerts?device_id=${ctx.deviceId}&type=toner_black_critical`, undefined, ctx.adminToken),
      (r) => r.data.length > 0,
    );
    assert.equal(alerts.data.length, 1, 'supplies_only sí debe generar alertas de tóner');
  });
});

describe('Estado de monitoreo — full: sin regresión', () => {
  test('volver a full restaura el comportamiento normal (lecturas + alertas)', async () => {
    const set = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'full' }, ctx.adminToken);
    assert.equal(set.status, 200);
    assert.equal(set.data.monitor_state, 'full');

    const before = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    const countBefore = before.data.length;

    const sync = await req('POST', '/devices/sync', {
      readings: [{
        reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.240.10', brand: 'hp',
        time: new Date(Date.now() + 4000).toISOString(), total_pages: 800, toner_black: 80, offline: false,
      }],
    }, ctx.agentToken);
    assert.equal(sync.status, 200);

    const after = await pollUntil(
      () => req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken),
      (r) => r.data.length > countBefore,
    );
    assert.ok(after.data.length > countBefore, 'full debe volver a insertar lecturas');

    const period = new Date().toISOString().slice(0, 7);
    const preview = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=${period}`, undefined, ctx.adminToken);
    assert.ok(
      preview.data.lines.some((l: any) => l.serial_number === ctx.deviceSerial),
      'full sí debe facturar — debe volver a aparecer en el preview'
    );
  });
});

describe('Estado de monitoreo — RBAC', () => {
  test('PUT /devices/:id/monitor-state → 403 para client_viewer', async () => {
    const created = await req('POST', '/portal/users', {
      username: `monstate_viewer_${ts}`, password: 'MonState1234!', role: 'client_viewer', client_id: ctx.clientId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: `monstate_viewer_${ts}`, password: 'MonState1234!' });
    const { status } = await req('PUT', `/devices/${ctx.deviceId}/monitor-state`, { state: 'disabled' }, login.data.token);
    assert.equal(status, 403);
  });
});

describe('Estado de monitoreo — invariante de escritura única de alertas', () => {
  test('ningún archivo fuera del repositorio de alertas inserta directo en la tabla alerts', () => {
    // Regresión estática: el guard de monitor_state vive SÓLO en
    // `OpenAlertUseCase` (modules/alerts), cuya única primitiva de escritura
    // es `KnexAlertRepository.insertIfNotOpen` — si algún archivo nuevo
    // empieza a hacer `db("alerts").insert(...)` por su cuenta, se saltea el
    // guard en silencio. Mismo criterio que motivó extraer `openAlert` en
    // primer lugar (ver el docblock del caso de uso).
    const ALLOWED = path.join('modules', 'alerts', 'infrastructure', 'database', 'knex-alert-repository.ts');
    const srcDir = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'tests') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.ts')) continue;
        if (full.endsWith(ALLOWED)) continue;
        const content = fs.readFileSync(full, 'utf8');
        if (/\balerts["']\)\s*\.\s*insert\s*\(/.test(content)) offenders.push(full);
      }
    };
    walk(srcDir);
    assert.deepEqual(offenders, [], `hay inserts directos a "alerts" fuera de ${ALLOWED}: ${offenders.join(', ')}`);
  });
});
