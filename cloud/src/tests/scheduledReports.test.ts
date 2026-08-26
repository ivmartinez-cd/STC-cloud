// Informes guardados/programados (Fase 4.1 del gap analysis vs HP SDS,
// re-comparación 24/08/2026) — tests de integración, mismo criterio que
// incidents.test.ts (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/scheduledReports.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { computeNextRunAt } from '../modules/scheduled-reports/domain/entities/scheduled-report';

const API  = process.env.API_URL  || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER     || 'admin';
const PASS = process.env.PORTAL_ADMIN_PASSWORD || '';

if (!PASS) {
  console.error('PORTAL_ADMIN_PASSWORD no definida. Exportar antes de correr los tests.');
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function req(method: string, path: string, body: unknown = {}, token?: string) {
  const isBodyless = method === 'GET' || method === 'HEAD' || method === 'DELETE';
  const headers: Record<string, string> = {};
  if (!isBodyless) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: isBodyless ? undefined : JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    const raw = await res.arrayBuffer();
    return { status: res.status, data: {} as any, raw: Buffer.from(raw), contentType };
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any, raw: null as Buffer | null, contentType };
}

describe('computeNextRunAt (unitario puro, determinista)', () => {
  // miércoles 2026-08-19 10:30 hora local
  const from = new Date(2026, 7, 19, 10, 30, 0);

  test('none → null', () => {
    assert.equal(computeNextRunAt({ freq: 'none', dow: null, dom: null, hour: 8 }, from), null);
  });

  test('daily: hora ya pasada hoy → mañana; hora futura → hoy', () => {
    const past = computeNextRunAt({ freq: 'daily', dow: null, dom: null, hour: 8 }, from)!;
    assert.equal(past.getDate(), 20);
    assert.equal(past.getHours(), 8);
    const future = computeNextRunAt({ freq: 'daily', dow: null, dom: null, hour: 15 }, from)!;
    assert.equal(future.getDate(), 19);
  });

  test('weekdays: un viernes a las 20 salta el finde', () => {
    const friday = new Date(2026, 7, 21, 21, 0, 0); // viernes 21/08 21:00, hora 20 ya pasó
    const next = computeNextRunAt({ freq: 'weekdays', dow: null, dom: null, hour: 20 }, friday)!;
    assert.equal(next.getDay(), 1); // lunes
    assert.equal(next.getDate(), 24);
  });

  test('weekly: próximo lunes', () => {
    const next = computeNextRunAt({ freq: 'weekly', dow: 1, dom: null, hour: 9 }, from)!;
    assert.equal(next.getDay(), 1);
    assert.ok(next > from);
  });

  test('monthly: día 1 del mes siguiente si ya pasó', () => {
    const next = computeNextRunAt({ freq: 'monthly', dow: null, dom: 1, hour: 8 }, from)!;
    assert.equal(next.getDate(), 1);
    assert.equal(next.getMonth(), 8); // septiembre
  });
});

describe('Informes programados e2e', () => {
  let token = '';
  let savedId = '';
  let scheduledId = '';

  test('setup: login admin', async () => {
    const r = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(r.status, 200);
    token = r.data.token;
  });

  test('crear informe guardado (sin programación) → next_run_at null', async () => {
    const r = await req('POST', '/scheduled-reports', {
      name: 'Lista de activos test', report_type: 'asset_list', format: 'xlsx',
    }, token);
    assert.equal(r.status, 201);
    assert.equal(r.data.next_run_at, null);
    savedId = r.data.id;
  });

  test('programado sin destinatarios → 400', async () => {
    const r = await req('POST', '/scheduled-reports', {
      name: 'Programado sin mails', report_type: 'asset_list', schedule_freq: 'daily',
    }, token);
    assert.equal(r.status, 400);
  });

  test('email inválido → 400', async () => {
    const r = await req('POST', '/scheduled-reports', {
      name: 'Mail roto', report_type: 'asset_list', recipients: ['no-es-un-mail'],
    }, token);
    assert.equal(r.status, 400);
  });

  test('crear informe diario programado → next_run_at futuro', async () => {
    const r = await req('POST', '/scheduled-reports', {
      name: 'Sin contacto diario test', report_type: 'non_contactable',
      params: { offline_days: 2 }, format: 'csv', schedule_freq: 'daily',
      schedule_hour: 8, recipients: ['reportes@test.local'],
    }, token);
    assert.equal(r.status, 201);
    assert.ok(r.data.next_run_at, 'next_run_at debe estar seteado');
    assert.ok(new Date(r.data.next_run_at) > new Date());
    scheduledId = r.data.id;
  });

  test('listado incluye ambos', async () => {
    const r = await req('GET', '/scheduled-reports', {}, token);
    assert.equal(r.status, 200);
    const ids = r.data.map((x: any) => x.id);
    assert.ok(ids.includes(savedId) && ids.includes(scheduledId));
  });

  test('editar: renombrar y cambiar formato', async () => {
    const r = await req('PUT', `/scheduled-reports/${savedId}`, {
      name: 'Lista de activos renombrada', report_type: 'asset_list', format: 'csv',
    }, token);
    assert.equal(r.status, 200);
    assert.equal(r.data.name, 'Lista de activos renombrada');
    assert.equal(r.data.format, 'csv');
  });

  // "Duplicar informe" — cierre de gap post-verificación del handoff hifi #3
  // (26/08/2026). Clona server-side, nunca copia activo/programado sin que
  // el operador lo revise.
  test('duplicar: clona con "(copia)" en el nombre, mismo tipo/formato, pausado', async () => {
    const r = await req('POST', `/scheduled-reports/${savedId}/duplicate`, {}, token);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.name, 'Lista de activos renombrada (copia)');
    assert.equal(r.data.report_type, 'asset_list');
    assert.equal(r.data.format, 'csv');
    assert.equal(r.data.enabled, false, 'la copia arranca pausada, aunque el original esté activo');
    assert.notEqual(r.data.id, savedId);

    const list = await req('GET', '/scheduled-reports', {}, token);
    const ids = list.data.map((x: any) => x.id);
    assert.ok(ids.includes(savedId) && ids.includes(r.data.id), 'original y copia coexisten');
    await req('DELETE', `/scheduled-reports/${r.data.id}`, {}, token);
  });

  test('duplicar un id inexistente → 404', async () => {
    const r = await req('POST', '/scheduled-reports/00000000-0000-0000-0000-000000000000/duplicate', {}, token);
    assert.equal(r.status, 404);
  });

  test('download genera CSV con cabecera', async () => {
    const r = await req('GET', `/scheduled-reports/${savedId}/download`, {}, token);
    assert.equal(r.status, 200);
    assert.ok(r.contentType.includes('text/csv'));
    assert.ok(r.raw!.toString('utf8').includes('Cliente'));
  });

  test('download XLSX del programado', async () => {
    const r2 = await req('PUT', `/scheduled-reports/${scheduledId}`, {
      name: 'Sin contacto diario test', report_type: 'non_contactable',
      params: { offline_days: 2 }, format: 'xlsx', schedule_freq: 'daily',
      schedule_hour: 8, recipients: ['reportes@test.local'],
    }, token);
    assert.equal(r2.status, 200);
    const r = await req('GET', `/scheduled-reports/${scheduledId}/download`, {}, token);
    assert.equal(r.status, 200);
    assert.ok(r.contentType.includes('spreadsheetml'));
    assert.equal(r.raw!.subarray(0, 2).toString('latin1'), 'PK'); // firma ZIP de un .xlsx real
  });

  test('run-now registra last_run (SMTP no configurado no-opea sin fallar)', async () => {
    const r = await req('POST', `/scheduled-reports/${scheduledId}/run`, {}, token);
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'ok');
    const list = await req('GET', '/scheduled-reports', {}, token);
    const row = list.data.find((x: any) => x.id === scheduledId);
    assert.equal(row.last_run_status, 'ok');
    assert.ok(row.last_run_at);
    assert.ok(new Date(row.next_run_at) > new Date(), 'run-now recalcula next_run_at');
  });

  test('informe de uso sin cliente → download 400 con mensaje claro', async () => {
    const r0 = await req('POST', '/scheduled-reports', {
      name: 'Uso sin cliente', report_type: 'usage',
    }, token);
    assert.equal(r0.status, 201);
    const r = await req('GET', `/scheduled-reports/${r0.data.id}/download`, {}, token);
    assert.equal(r.status, 400);
    await req('DELETE', `/scheduled-reports/${r0.data.id}`, {}, token);
  });

  test('borrar: 204 y desaparece', async () => {
    const r = await req('DELETE', `/scheduled-reports/${savedId}`, {}, token);
    assert.equal(r.status, 204);
    const gone = await req('GET', `/scheduled-reports/${savedId}/download`, {}, token);
    assert.equal(gone.status, 404);
    await req('DELETE', `/scheduled-reports/${scheduledId}`, {}, token);
  });

  // Handoff hifi #3, fase 5, 26/08/2026 — catálogo real de 5 REPORT_TYPES.
  // Cierre de gap post-verificación (mismo día): "Cierre de facturación" y
  // "Auditoría de accesos" pasan a tener un ReportType real detrás (antes
  // eran 2 de los 6 nombres del mockup sin respaldo) → 7 plantillas.
  test('GET /scheduled-reports/templates trae las 7 plantillas reales, cada una con report_type creable', async () => {
    const r = await req('GET', '/scheduled-reports/templates', {}, token);
    assert.equal(r.status, 200);
    assert.equal(r.data.length, 7);
    for (const t of r.data) {
      assert.ok(t.report_type && t.label && t.description, `plantilla incompleta: ${JSON.stringify(t)}`);
      assert.ok(['csv', 'xlsx'].includes(t.default_format));
    }
    const types = r.data.map((t: any) => t.report_type).sort();
    assert.deepEqual(types, ['alert_history', 'asset_list', 'audit_export', 'billing_closure', 'consumable_levels', 'non_contactable', 'usage']);
  });

  // Cierre de gap post-verificación del handoff hifi #3 (26/08/2026): las 2
  // plantillas "fantasma" del mockup ahora generan de verdad.
  test('billing_closure: sin cierres todavía → download igual da 200 con tabla vacía (no error)', async () => {
    const clientNoClosures = await req('POST', '/clients', { name: `Sin Cierres Test ${Date.now()}` }, token);
    assert.equal(clientNoClosures.status, 200);
    const created = await req('POST', '/scheduled-reports', {
      name: 'Cierre sin datos', report_type: 'billing_closure', client_id: clientNoClosures.data.id, format: 'csv',
    }, token);
    assert.equal(created.status, 201);
    const dl = await req('GET', `/scheduled-reports/${created.data.id}/download`, {}, token);
    assert.equal(dl.status, 200);
    assert.ok(dl.raw!.toString('utf8').includes('Serie'), 'trae el encabezado aunque no haya filas');
    await req('DELETE', `/scheduled-reports/${created.data.id}`, {}, token);
  });

  test('billing_closure: con un cierre real → download trae la línea del equipo con su delta', async () => {
    const bts = Date.now();
    const client = await req('POST', '/clients', { name: `Billing Closure Real Test ${bts}` }, token);
    assert.equal(client.status, 200);
    const agent = await req('POST', '/agents', { clientId: client.data.id, name: 'Agente Billing Closure' }, token);
    assert.equal(agent.status, 200);
    const activate = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-BC-${bts}` });
    assert.equal(activate.status, 200);
    const agentToken = activate.data.token;
    const serial = `SN-BC-${bts}`;
    const registered = await req('POST', '/devices/register', {
      devices: [{ ip: '192.168.232.9', mac: null, serial, brand: 'hp', model: 'HP LaserJet BC', name: 'BC Device' }],
    }, agentToken);
    assert.equal(registered.status, 200);
    const sync = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: '192.168.232.9', brand: 'hp', time: new Date().toISOString(), total_pages: 300, mono_pages: 300, color_pages: 0, offline: false }],
    }, agentToken);
    assert.equal(sync.status, 200);

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const close = await req('POST', `/clients/${client.data.id}/reports/close`, { period }, token);
    assert.equal(close.status, 200, JSON.stringify(close.data));

    const created = await req('POST', '/scheduled-reports', {
      name: 'Cierre con datos', report_type: 'billing_closure', client_id: client.data.id, format: 'csv',
    }, token);
    assert.equal(created.status, 201);
    const dl = await req('GET', `/scheduled-reports/${created.data.id}/download`, {}, token);
    assert.equal(dl.status, 200);
    assert.ok(dl.raw!.toString('utf8').includes(serial), 'debe traer la línea del equipo del cierre recién hecho');
    await req('DELETE', `/scheduled-reports/${created.data.id}`, {}, token);
  });

  test('billing_closure sin cliente → download 400 con mensaje claro', async () => {
    const created = await req('POST', '/scheduled-reports', { name: 'Cierre sin cliente', report_type: 'billing_closure' }, token);
    assert.equal(created.status, 201);
    const dl = await req('GET', `/scheduled-reports/${created.data.id}/download`, {}, token);
    assert.equal(dl.status, 400);
    await req('DELETE', `/scheduled-reports/${created.data.id}`, {}, token);
  });

  test('audit_export: genera CSV real con el encabezado de accesos (sin cliente = toda la red)', async () => {
    const created = await req('POST', '/scheduled-reports', {
      name: 'Accesos test', report_type: 'audit_export', params: { days: 90 }, format: 'csv',
    }, token);
    assert.equal(created.status, 201);
    const dl = await req('GET', `/scheduled-reports/${created.data.id}/download`, {}, token);
    assert.equal(dl.status, 200);
    const text = dl.raw!.toString('utf8');
    assert.ok(text.includes('Acción'), JSON.stringify({ contentType: dl.contentType, sample: text.slice(0, 200) }));
    // El login de "setup: login admin" de este mismo describe ya generó un
    // USER_LOGIN_SUCCESS dentro de la ventana de 90 días.
    assert.ok(text.includes('Inicio de sesión'), text.slice(0, 300));
    await req('DELETE', `/scheduled-reports/${created.data.id}`, {}, token);
  });
});
