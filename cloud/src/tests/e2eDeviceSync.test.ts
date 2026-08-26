// E2E — registro/sincronización de dispositivos, concurrencia del sync y
// detección de reset de contador. Separado de e2e.test.ts (deuda de
// sizes-baseline, 2026-08-26) sólo por tamaño de archivo; fixture propia
// (cliente + agente + activar) porque corre en su propio proceso.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/e2eDeviceSync.test.ts
//
// IMPORTANTE: Requiere que exista al menos un cliente en la BD (npm run seed) —
// no, en realidad no: este archivo crea el suyo propio, a diferencia de
// e2e.test.ts que reusa el primero de /clients.

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

const ts = Date.now();
const ctx = {
  portalToken: '', clientId: '', agentId: '', agentToken: '',
  deviceSerial: `SN-E2E-SYNC-${ts}`,
};

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

describe('E2E device sync — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.portalToken = login.data.token;

    const client = await req('POST', '/clients', { name: `E2E Device Sync Test Client ${ts}` }, ctx.portalToken);
    assert.equal(client.status, 200);
    ctx.clientId = client.data.id;

    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente E2E Device Sync ${ts}` }, ctx.portalToken);
    assert.equal(agent.status, 200);
    ctx.agentId = agent.data.agentId;

    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-E2E-SYNC-${ts}` });
    assert.equal(activate.status, 200);
    ctx.agentToken = activate.data.token;
  });
});

describe('Registro y sincronización de dispositivos', () => {
  test('Registrar dispositivo → 200', async () => {
    const { status } = await req('POST', '/devices/register', {
      devices: [{
        ip:     '192.168.100.50',
        mac:    null,
        serial: ctx.deviceSerial,
        brand:  'hp',
        model:  'HP LaserJet Pro M404n',
        name:   'Impresora E2E',
      }],
    }, ctx.agentToken);
    assert.equal(status, 200);
  });

  test('Sincronizar lectura → 200', async () => {
    const { status, data } = await req('POST', '/devices/sync', {
      readings: [{
        device_id:    ctx.deviceSerial,
        ip:           '192.168.100.50',
        brand:        'hp',
        time:         new Date().toISOString(),
        total_pages:  24500,
        mono_pages:   21000,
        color_pages:  3500,
        toner_black:  75,
        toner_cyan:   60,
        toner_magenta: 55,
        toner_yellow:  80,
        status:       'idle',
        offline:      false,
      }],
    }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.count, 1);
  });

  test('Sync rechaza más de 500 lecturas → 400', async () => {
    const readings = Array.from({ length: 501 }, (_, i) => ({
      device_id:   `SN-OVERFLOW-${i}`,
      time:        new Date().toISOString(),
      total_pages: i,
    }));
    const { status } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 400);
  });

  test('Lecturas del dispositivo accesibles desde portal', async () => {
    // El device_id en la BD es un UUID asignado al serial — buscar vía /clients/:id/devices
    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    const device = devicesData.find((d: any) => d.serial_number === ctx.deviceSerial);
    assert.ok(device, 'Dispositivo registrado debe aparecer en lista del cliente');

    const { status, data } = await req('GET', `/devices/${device.id}/readings?limit=10`, undefined, ctx.portalToken);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data) && data.length > 0, 'Debe haber lecturas guardadas');
    assert.equal(data[0].total_pages, 24500, 'El valor de páginas debe coincidir');
  });

  test('Sync con reading_id repetido no duplica la lectura (idempotencia)', async () => {
    const readingId = crypto.randomUUID();
    const dedupReading = {
      reading_id:   readingId,
      device_id:    ctx.deviceSerial,
      ip:           '192.168.100.50',
      brand:        'hp',
      time:         new Date().toISOString(),
      total_pages:  99999,
      offline:      false,
    };

    const first = await req('POST', '/devices/sync', { readings: [dedupReading] }, ctx.agentToken);
    assert.equal(first.status, 200);
    assert.equal(first.data.inserted, 1);
    assert.equal(first.data.duplicates, 0);

    // Reintento del mismo lote (simula respuesta perdida y reenvío del agente)
    const retry = await req('POST', '/devices/sync', { readings: [dedupReading] }, ctx.agentToken);
    assert.equal(retry.status, 200);
    assert.equal(retry.data.inserted, 0);
    assert.equal(retry.data.duplicates, 1);

    // No debe haber quedado una fila duplicada con ese total_pages
    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    const device = devicesData.find((d: any) => d.serial_number === ctx.deviceSerial);
    const { data: readingsData } = await req('GET', `/devices/${device.id}/readings?limit=500`, undefined, ctx.portalToken);
    const matches = readingsData.filter((r: any) => r.total_pages === 99999);
    assert.equal(matches.length, 1, 'Debe existir una unica fila para ese reading_id, no duplicada');
  });
});

describe('Concurrencia del sync (batching, auditoría de capacidad 200+ clientes)', () => {
  test('Lote con 12 dispositivos distintos en un solo sync → los 12 se registran e insertan', async () => {
    const prefix = `SN-CONC-${Date.now()}`;
    const readings = Array.from({ length: 12 }, (_, i) => ({
      device_id:   `${prefix}-${i}`,
      ip:          `192.168.101.${10 + i}`,
      brand:       'hp',
      model:       `HP Concurrencia ${i}`,
      time:        new Date().toISOString(),
      total_pages: 1000 + i,
      offline:     false,
    }));
    const { status, data } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.inserted, 12, 'las 12 lecturas de dispositivos distintos deben insertarse');

    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    for (let i = 0; i < 12; i++) {
      const device = devicesData.find((d: any) => d.serial_number === `${prefix}-${i}`);
      assert.ok(device, `dispositivo ${i} debe existir`);
      // devices.total_pages es BIGINT -> node-pg lo devuelve como string.
      assert.equal(Number(device.total_pages), 1000 + i, `dispositivo ${i} debe tener su propio total_pages, sin mezclarse con otro del lote`);
    }
  });

  test('Una lectura con supplies_details corrupto no tumba el resto del lote (aislamiento por lectura preservado)', async () => {
    const prefix = `SN-CONC-BAD-${Date.now()}`;
    const readings = [
      { device_id: `${prefix}-ok1`, ip: '192.168.101.201', brand: 'hp', time: new Date().toISOString(), total_pages: 500, offline: false },
      // supplies_details string no-JSON → JSON.parse tira adentro de processReading
      { device_id: `${prefix}-bad`, ip: '192.168.101.202', brand: 'hp', time: new Date().toISOString(), total_pages: 600, offline: false, supplies_details: '{esto no es json' },
      { device_id: `${prefix}-ok2`, ip: '192.168.101.203', brand: 'hp', time: new Date().toISOString(), total_pages: 700, offline: false },
    ];
    const { status, data } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.inserted, 2, 'las 2 lecturas buenas deben insertarse aunque la del medio falle');

    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    assert.ok(devicesData.find((d: any) => d.serial_number === `${prefix}-ok1`), 'ok1 debe existir');
    assert.ok(devicesData.find((d: any) => d.serial_number === `${prefix}-ok2`), 'ok2 debe existir');
    // El upsert del dispositivo corre ANTES del JSON.parse que revienta (más
    // abajo, al sincronizar alertas EWS) — comportamiento preexistente, no
    // introducido por el refactor: el dispositivo "bad" sí se crea/actualiza,
    // sólo su LECTURA queda afuera de `readings` (ya cubierto arriba por
    // `inserted === 2`, no 3).
    assert.ok(devicesData.find((d: any) => d.serial_number === `${prefix}-bad`), 'bad sí debe existir como dispositivo (el upsert corre antes del parseo que falla)');
  });

  test('Dos lecturas del MISMO dispositivo en un solo lote se procesan en orden (sin lost-update)', async () => {
    const serial = `SN-CONC-SAME-${Date.now()}`;
    const readings = [
      { device_id: serial, ip: '192.168.101.210', brand: 'hp', model: 'HP Same-Device', time: new Date(Date.now() - 1000).toISOString(), total_pages: 100, offline: false },
      { device_id: serial, ip: '192.168.101.210', brand: 'hp', model: 'HP Same-Device', time: new Date().toISOString(), total_pages: 200, offline: false },
    ];
    const { status, data } = await req('POST', '/devices/sync', { readings }, ctx.agentToken);
    assert.equal(status, 200);
    assert.equal(data.inserted, 2, 'ambas lecturas del mismo dispositivo deben insertarse en el historial');

    const { data: devicesData } = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.portalToken);
    const device = devicesData.find((d: any) => d.serial_number === serial);
    assert.ok(device, 'el dispositivo debe existir una sola vez, no duplicado');
    assert.equal(Number(device.total_pages), 200, 'el estado final debe reflejar la ÚLTIMA lectura del lote (100→200), no quedar en un valor intermedio por una carrera');
  });
});

describe('Detección de reset de contador y volumen mensual', () => {
  const resetDeviceSerial = `SN-E2E-RESET-${Date.now()}`;
  let resetDeviceId = '';

  test('Registrar dispositivo dedicado → 200', async () => {
    const { status } = await req('POST', '/devices/register', {
      devices: [{
        ip:     '192.168.100.51',
        mac:    null,
        serial: resetDeviceSerial,
        brand:  'hp',
        model:  'HP LaserJet Pro M404n',
        name:   'Impresora E2E Reset',
      }],
    }, ctx.agentToken);
    assert.equal(status, 200);
  });

  test('Sincronizar secuencia con reset (100 → 150 → 5 → 60)', async () => {
    const base = Date.now();
    const sequence = [100, 150, 5, 60];
    for (let i = 0; i < sequence.length; i++) {
      const { status } = await req('POST', '/devices/sync', {
        readings: [{
          reading_id:  crypto.randomUUID(),
          device_id:   resetDeviceSerial,
          ip:          '192.168.100.51',
          brand:       'hp',
          time:        new Date(base + i * 1000).toISOString(),
          total_pages: sequence[i],
          offline:     false,
        }],
      }, ctx.agentToken);
      assert.equal(status, 200);
    }
  });

  test('monthly_pages usa suma de deltas positivos, no MAX-MIN', async () => {
    const { status, data } = await req('GET', `/agents/${ctx.agentId}/devices`, undefined, ctx.portalToken);
    assert.equal(status, 200);
    const device = data.find((d: any) => d.serial_number === resetDeviceSerial);
    assert.ok(device, 'El dispositivo dedicado debe aparecer en la lista del agente');
    resetDeviceId = device.id;
    // Con MAX-MIN hubiese dado 150-5=145 (inflado por el reset). Correcto: 50+0+55=105.
    assert.equal(device.monthly_pages, 105, 'monthly_pages debe ser 105, no 145 (MAX-MIN)');
  });

  test('Se genera una alerta counter_reset', async () => {
    const { status, data } = await req('GET', `/alerts?device_id=${resetDeviceId}`, undefined, ctx.portalToken);
    assert.equal(status, 200);
    const resetAlert = data.find((a: any) => a.type === 'counter_reset');
    assert.ok(resetAlert, 'Debe existir una alerta de tipo counter_reset');
    assert.equal(resetAlert.severity, 'critical');
  });
});
