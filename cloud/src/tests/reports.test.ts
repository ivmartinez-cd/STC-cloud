// Reportes por cliente: cierre mensual inmutable — Tests de integración, mismo
// criterio que e2e.test.ts/rbac.test.ts/alerts.test.ts (backend corriendo en
// localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/reports.test.ts

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

/** GET crudo (no JSON) para probar el export CSV. */
async function getRaw(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const text = await res.text();
  return { status: res.status, text };
}

/** Para respuestas binarias (XLSX) — `res.text()` corrompe el contenido. */
async function getBinary(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType: res.headers.get('content-type'), buffer };
}

const ts = Date.now();
const now = new Date();
const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const ctx = {
  adminToken: '',
  clientId: '', clientBId: '',
  agentId: '', agentToken: '',
  deviceSerial: `SN-REPORTS-${ts}`, deviceId: '',
  closureId: '',
};

describe('Reportes — fixtures', () => {
  test('Setup: login admin', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(status, 200);
    ctx.adminToken = data.token;
  });

  test('Setup: crear cliente + agente + activar + registrar dispositivo', async () => {
    const client = await req('POST', '/clients', { name: `Reports Test Client ${ts}` }, ctx.adminToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const clientB = await req('POST', '/clients', { name: `Reports Test Client B ${ts}` }, ctx.adminToken);
    assert.equal(clientB.status, 200);
    ctx.clientBId = clientB.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: 'Reports Test Agent' }, ctx.adminToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;

    const activated = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `REPORTS-HW-${ts}` });
    assert.equal(activated.status, 200);
    ctx.agentToken = activated.data.token;

    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.230.5', mac: null, serial: ctx.deviceSerial, brand: 'hp', model: 'HP LaserJet Reports', name: 'Reports Test Device' }],
    }, ctx.agentToken);
    assert.equal(registered.status, 200);

    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    const device = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device, 'Dispositivo debe existir');
    ctx.deviceId = device.id;
  });

  test('Setup: sincronizar secuencia con reset de contador dentro del período (100 → 150 → 30)', async () => {
    const base = Date.now();
    const sequence = [100, 150, 30];
    for (let i = 0; i < sequence.length; i++) {
      const { status } = await req('POST', '/devices/sync', {
        readings: [{
          reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.230.5', brand: 'hp',
          time: new Date(base + i * 1000).toISOString(), total_pages: sequence[i], mono_pages: sequence[i], color_pages: 0,
          offline: false,
        }],
      }, ctx.agentToken);
      assert.equal(status, 200);
    }
  });
});

describe('Reportes — preview (no persiste nada)', () => {
  test('GET /clients/:id/reports/preview?period=… trae la línea del dispositivo con el delta correcto', async () => {
    const { status, data } = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=${period}`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.period, period);
    const line = data.lines.find((l: any) => l.device_id === ctx.deviceId);
    assert.ok(line, 'La línea del dispositivo de prueba debe estar en el preview');
    assert.equal(Number(line.first_total), 100);
    assert.equal(Number(line.last_total), 30);
    // 100→150 (delta +50, cuenta) → 30 (delta -120, GREATEST(...,0)=0 por el reset).
    // La primera lectura no tiene base previa (equipo recién creado) → su delta no cuenta.
    assert.equal(Number(line.delta_total), 50, 'El delta debe ser la suma de deltas positivos, no last-first');
    assert.equal(line.had_counter_reset, true, 'Debe detectar el reset dentro del período (cruzado contra alerts)');
  });

  test('preview con period inválido → 400', async () => {
    const { status } = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=2026-13`, undefined, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('preview sin period → 400 (validación de schema)', async () => {
    const { status } = await req('GET', `/clients/${ctx.clientId}/reports/preview`, undefined, ctx.adminToken);
    assert.equal(status, 400);
  });
});

describe('Reportes — cierre inmutable', () => {
  test('POST /clients/:id/reports/close persiste el mismo delta que el preview', async () => {
    const { status, data } = await req('POST', `/clients/${ctx.clientId}/reports/close`, { period }, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(data.status, 'closed');
    assert.equal(Number(data.total_pages), 50);
    ctx.closureId = data.id;

    const detail = await req('GET', `/clients/${ctx.clientId}/reports/${ctx.closureId}`, undefined, ctx.adminToken);
    assert.equal(detail.status, 200);
    const line = detail.data.lines.find((l: any) => l.device_id === ctx.deviceId);
    assert.ok(line);
    assert.equal(Number(line.delta_total), 50);
    assert.equal(line.had_counter_reset, true);
    assert.equal(line.device_serial, ctx.deviceSerial, 'La identidad del equipo queda denormalizada en la línea');
  });

  test('cerrar el mismo período de nuevo → 409 (un cierre existente nunca se sobreescribe)', async () => {
    const { status } = await req('POST', `/clients/${ctx.clientId}/reports/close`, { period }, ctx.adminToken);
    assert.equal(status, 409);
  });

  test('GET /clients/:id/reports lista el cierre', async () => {
    const { status, data } = await req('GET', `/clients/${ctx.clientId}/reports`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    assert.ok(data.some((c: any) => c.id === ctx.closureId));
  });

  test('reabrir + cerrar de nuevo crea un cierre nuevo y linkea superseded_by en el viejo', async () => {
    const reopened = await req('POST', `/clients/${ctx.clientId}/reports/${ctx.closureId}/reopen`, { reason: 'Ajuste de prueba' }, ctx.adminToken);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.data.status, 'reopened');

    const closedAgain = await req('POST', `/clients/${ctx.clientId}/reports/close`, { period }, ctx.adminToken);
    assert.equal(closedAgain.status, 200);
    assert.notEqual(closedAgain.data.id, ctx.closureId, 'Debe ser un cierre NUEVO, no una edición del viejo');

    const oldClosure = await req('GET', `/clients/${ctx.clientId}/reports/${ctx.closureId}`, undefined, ctx.adminToken);
    assert.equal(oldClosure.data.superseded_by, closedAgain.data.id);
    // El cierre viejo sigue existiendo con sus números intactos — nunca se edita.
    assert.equal(Number(oldClosure.data.total_pages), 50);

    ctx.closureId = closedAgain.data.id;
  });

  test('reabrir un cierre que no es propio (client B) → 404', async () => {
    const { status } = await req('POST', `/clients/${ctx.clientBId}/reports/${ctx.closureId}/reopen`, {}, ctx.adminToken);
    assert.equal(status, 404);
  });

  test('reabrir un cierre inexistente → 404', async () => {
    const { status } = await req('POST', `/clients/${ctx.clientId}/reports/00000000-0000-0000-0000-000000000000/reopen`, {}, ctx.adminToken);
    assert.equal(status, 404);
  });
});

describe('Reportes — export CSV', () => {
  test('GET .../export.csv trae el delta y el serial del equipo', async () => {
    const { status, text } = await getRaw(`/clients/${ctx.clientId}/reports/${ctx.closureId}/export.csv`, ctx.adminToken);
    assert.equal(status, 200);
    assert.ok(text.includes(ctx.deviceSerial), 'El CSV debe incluir el serial del equipo');
    assert.ok(text.includes(';50;'), 'El CSV debe incluir el delta total (50) en alguna fila');
  });

  test('export.csv de un cierre de otro cliente → 404', async () => {
    const { status } = await getRaw(`/clients/${ctx.clientBId}/reports/${ctx.closureId}/export.csv`, ctx.adminToken);
    assert.equal(status, 404);
  });
});

describe('Reportes — export XLSX', () => {
  test('GET .../export.xlsx trae un workbook real (firma ZIP, content-type correcto)', async () => {
    const { status, contentType, buffer } = await getBinary(`/clients/${ctx.clientId}/reports/${ctx.closureId}/export.xlsx`, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // XLSX es un ZIP — firma mágica "PK" (0x50 0x4B) al inicio del archivo.
    assert.equal(buffer[0], 0x50);
    assert.equal(buffer[1], 0x4b);
    assert.ok(buffer.length > 1000, 'El archivo no debe estar vacío/truncado');
  });
});
