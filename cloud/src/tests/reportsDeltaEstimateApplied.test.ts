// Delta estimado aplicado SOLO al total oficial del cierre — cierre de gap
// post-verificación del handoff hifi #3 (26/08/2026). Antes la estimación
// (`delta_estimated`) era puramente informativa: un reset de contador dejaba
// esas páginas afuera del total facturado para siempre. Ahora, al cerrar,
// `sumUsageTotals` usa la estimación cuando hay reset y hay estimación
// positiva (ver `modules/reports/domain/services/period.ts`). Este test
// arma 90 días de historial "limpio" real (vía `readings_daily_agg`, mismo
// mecanismo que `deviceUsageHistory.test.ts`) y un reset DENTRO del
// período. Usa el mes EN CURSO (no el anterior): la alerta `counter_reset`
// que dispara `had_counter_reset` se crea con `created_at = now()` real —
// si el período fuera el mes pasado, la alerta (de HOY) quedaría afuera de
// la ventana `resets` de la query y el reset nunca se detectaría. Sin
// colisión con otros tests de reports: cada uno usa su propio dispositivo.
// Ejecutar: API_URL=http://localhost:3000/api/v1 PORTAL_ADMIN_PASSWORD=... npx tsx --test src/tests/reportsDeltaEstimateApplied.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knexLib from 'knex';

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
  const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const rawDb = knexLib({
  client: 'pg',
  connection: {
    host: process.env.ALERTS_TEST_DB_HOST || 'localhost',
    port: Number(process.env.ALERTS_TEST_DB_PORT || 5434),
    user: process.env.DB_USER || 'stc_admin',
    password: process.env.DB_PASSWORD || 'stc_secret',
    database: process.env.DB_NAME || 'stc_cloud',
  },
});
after(async () => { await rawDb.destroy().catch(() => {}); });

const ts = Date.now();
const now = new Date();
// Mes en curso — la alerta counter_reset se crea con created_at=now() real, tiene que caer dentro del período.
const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const period = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`;

function atOffsetDays(base: Date, offsetDays: number, hour = 12): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const ctx = { adminToken: '', clientId: '', agentId: '', agentToken: '', deviceSerial: `SN-DELTA-EST-${ts}`, deviceId: '' };

async function sync(totalPages: number, time: string) {
  const { status } = await req('POST', '/devices/sync', {
    readings: [{
      reading_id: crypto.randomUUID(), device_id: ctx.deviceSerial, ip: '192.168.231.7', brand: 'hp',
      time, total_pages: totalPages, mono_pages: totalPages, color_pages: 0, offline: false,
    }],
  }, ctx.agentToken);
  assert.equal(status, 200, `sync total_pages=${totalPages} @ ${time} debe dar 200`);
}

describe('delta_estimated aplicado al total oficial del cierre — fixtures', () => {
  test('Setup: login admin, crear cliente + agente + activar + registrar dispositivo', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const client = await req('POST', '/clients', { name: `Delta Estimate Test ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: `Agente Delta Estimate ${ts}` }, ctx.adminToken);
    ctx.agentId = agent.data.agentId;
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-DELTA-EST-${ts}` });
    ctx.agentToken = activate.data.token;

    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.231.7', mac: null, serial: ctx.deviceSerial, brand: 'hp', model: 'HP LaserJet Delta Estimate', name: 'Delta Estimate Device' }],
    }, ctx.agentToken);
    assert.equal(registered.status, 200);
    const devices = await req('GET', `/clients/${ctx.clientId}/devices`, undefined, ctx.adminToken);
    ctx.deviceId = devices.data.find((d: any) => d.serial_number === ctx.deviceSerial).id;
  });

  test('Historial "limpio" de 10 días antes del período: +200 páginas/día', async () => {
    for (let i = 10; i >= 1; i--) {
      await sync(1000 + (10 - i) * 200, atOffsetDays(periodStart, -i));
    }
    await rawDb.raw(`CALL refresh_continuous_aggregate('readings_daily_agg', NULL, NULL)`);
  });

  test('Reset de contador DENTRO del período (hoy): 2800 → 3000 → 100', async () => {
    await sync(3000, new Date(now.getTime() - 2000).toISOString());
    await sync(100, new Date().toISOString());
  });
});

describe('preview → el reset queda con delta_estimated positivo y bien por encima del delta crudo', () => {
  test('GET preview: had_counter_reset=true, delta_estimated > delta_total (~200/día extrapolado al mes)', async () => {
    const { status, data } = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=${period}`, undefined, ctx.adminToken);
    assert.equal(status, 200);
    const line = data.lines.find((l: any) => l.device_id === ctx.deviceId);
    assert.ok(line, 'la línea del dispositivo debe estar en el preview');
    assert.equal(line.had_counter_reset, true);
    assert.equal(Number(line.delta_total), 200, 'sólo cuenta el salto positivo 2800→3000; el resto es reset (GREATEST(...,0))');
    assert.ok(Number(line.delta_estimated) > Number(line.delta_total), `delta_estimated (${line.delta_estimated}) debe superar largamente al crudo (${line.delta_total})`);
    ctx.deviceId = line.device_id;
  });
});

describe('cierre — el total oficial usa la estimación, no el delta crudo', () => {
  test('POST close: total_pages del cierre = delta_estimated de la línea, no delta_total', async () => {
    const preview = await req('GET', `/clients/${ctx.clientId}/reports/preview?period=${period}`, undefined, ctx.adminToken);
    const previewLine = preview.data.lines.find((l: any) => l.device_id === ctx.deviceId);
    const estimated = Number(previewLine.delta_estimated);
    assert.ok(estimated > 0);

    const close = await req('POST', `/clients/${ctx.clientId}/reports/close`, { period }, ctx.adminToken);
    assert.equal(close.status, 200, JSON.stringify(close.data));
    assert.equal(Number(close.data.total_pages), estimated, 'el total oficial del cierre debe coincidir con la estimación, no con el delta crudo (200)');
    assert.notEqual(Number(close.data.total_pages), Number(previewLine.delta_total));

    const detail = await req('GET', `/clients/${ctx.clientId}/reports/${close.data.id}`, undefined, ctx.adminToken);
    const closedLine = detail.data.lines.find((l: any) => l.device_id === ctx.deviceId);
    assert.equal(Number(closedLine.delta_total), 200, 'el campo crudo por línea NO se pisa — queda intacto para auditoría');
    assert.equal(Number(closedLine.delta_estimated), estimated);

    // Invariante total = mono + color + other también con la estimación aplicada.
    assert.equal(Number(close.data.total_pages), Number(close.data.total_mono) + Number(close.data.total_color) + Number(close.data.total_other));
  });
});
