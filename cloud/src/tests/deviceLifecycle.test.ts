// Identidad de dispositivo por cliente + ciclo de vida (§2.4 del gap analysis) —
// Tests de integración, mismo criterio que e2e.test.ts/rbac.test.ts/alerts.test.ts
// (backend corriendo en localhost:3000/3001).
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/deviceLifecycle.test.ts

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

// Mutaciones sin cuerpo deben mandar `{}`, nunca `undefined`: con Content-Type
// application/json fijo, un body undefined hace que Fastify responda
// FST_ERR_CTP_EMPTY_JSON_BODY (400) ANTES del preHandler de RBAC. GET/HEAD no
// pueden llevar body en absoluto (fetch lo rechaza), así que el default `{}`
// sólo aplica a los demás métodos.
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

const ts = Date.now();

const ctx = {
  adminToken: '',
  clientAId: '', clientBId: '',
  agentA1Id: '', agentA1Token: '',
  agentA2Id: '', agentA2Token: '',
  agentBId: '', agentBToken: '',
  deviceId: '', deviceId2: '',
};

describe('Identidad de dispositivo por cliente — fixtures', () => {
  test('Setup: login admin + 2 clientes + 3 agentes (2 del mismo cliente A, 1 de B)', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;

    const clientA = await req('POST', '/clients', { name: `Identity Test A ${ts}` }, ctx.adminToken);
    ctx.clientAId = clientA.data.id;
    const clientB = await req('POST', '/clients', { name: `Identity Test B ${ts}` }, ctx.adminToken);
    ctx.clientBId = clientB.data.id;

    for (const [key, tokenKey, clientId, name] of [
      ['agentA1Id', 'agentA1Token', ctx.clientAId, 'Sede A1'],
      ['agentA2Id', 'agentA2Token', ctx.clientAId, 'Sede A2'],
      ['agentBId', 'agentBToken', ctx.clientBId, 'Sede B'],
    ] as const) {
      const agent = await req('POST', '/agents', { clientId, name }, ctx.adminToken);
      const activated = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-${key}-${ts}` });
      (ctx as any)[key] = agent.data.agentId;
      (ctx as any)[tokenKey] = activated.data.token;
    }
  });
});

describe('Identidad — escalera serial → mac → ip', () => {
  test('Dos agentes del mismo cliente reportando el MISMO serial convergen a UNA sola fila', async () => {
    const serial = `SN-CONVERGE-${ts}`;
    const s1 = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: '10.0.1.5', brand: 'hp',
        time: new Date().toISOString(), total_pages: 100, mono_pages: 100, color_pages: 0, offline: false }],
    }, ctx.agentA1Token);
    assert.equal(s1.status, 200);

    const s2 = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: '10.0.2.5', brand: 'hp',
        time: new Date(Date.now() + 1000).toISOString(), total_pages: 150, mono_pages: 150, color_pages: 0, offline: false }],
    }, ctx.agentA2Token);
    assert.equal(s2.status, 200);

    const list = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    const matches = list.data.filter((d: any) => d.serial_number === serial);
    assert.equal(matches.length, 1, 'Debe converger a una sola fila, no dos');
    ctx.deviceId = matches[0].id;

    const readings = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    assert.ok(readings.data.length >= 2, 'El historial debe estar unificado (ambas lecturas)');
  });

  test('Misma IP bajo dos agentes DISTINTOS del mismo cliente → dos filas (no fusiona por IP entre sedes)', async () => {
    const ip = '10.9.9.9';
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: ip, ip, brand: 'hp',
        time: new Date().toISOString(), total_pages: 10, mono_pages: 10, color_pages: 0, offline: false }],
    }, ctx.agentA1Token);
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: ip, ip, brand: 'hp',
        time: new Date().toISOString(), total_pages: 20, mono_pages: 20, color_pages: 0, offline: false }],
    }, ctx.agentA2Token);

    const list = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    const matches = list.data.filter((d: any) => d.ip_address === ip);
    assert.equal(matches.length, 2, 'Sedes distintas con la misma IP privada no deben fusionarse');
  });

  test('Serial de la denylist (genérico) nunca identifica — no fusiona equipos distintos', async () => {
    const genericSerial = '000000000';
    const r1 = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: genericSerial, ip: '10.5.5.1', brand: 'brother',
        time: new Date().toISOString(), total_pages: 5, mono_pages: 5, color_pages: 0, offline: false }],
    }, ctx.agentA1Token);
    assert.equal(r1.status, 200);
    const r2 = await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: genericSerial, ip: '10.5.5.2', brand: 'brother',
        time: new Date().toISOString(), total_pages: 8, mono_pages: 8, color_pages: 0, offline: false }],
    }, ctx.agentA1Token);
    assert.equal(r2.status, 200);

    const list = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    const byIp1 = list.data.find((d: any) => d.ip_address === '10.5.5.1');
    const byIp2 = list.data.find((d: any) => d.ip_address === '10.5.5.2');
    assert.ok(byIp1 && byIp2 && byIp1.id !== byIp2.id, 'Dos IPs distintas con serial genérico deben ser dos filas distintas');
  });
});

describe('Ciclo de vida — editar (columna generada, la ingesta no la pisa)', () => {
  test('PUT /devices/:id {name} persiste tras un sync posterior con otro nombre', async () => {
    const put = await req('PUT', `/devices/${ctx.deviceId}`, { name: 'Nombre manual del operador' }, ctx.adminToken);
    assert.equal(put.status, 200);
    assert.equal(put.data.name, 'Nombre manual del operador');
    assert.equal(put.data.name_override, 'Nombre manual del operador');

    // La ingesta reporta un hostname nuevo para el mismo dispositivo (mismo
    // serial) — `hostname` es el campo que realmente alimenta `name_reported`
    // en la rama de actualización de `syncReadings` (no `name`, que sólo se
    // usa al CREAR un dispositivo nuevo).
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: `SN-CONVERGE-${ts}`, ip: '10.0.1.5', brand: 'hp',
        hostname: 'firmware-host.local', time: new Date(Date.now() + 5000).toISOString(),
        total_pages: 200, mono_pages: 200, color_pages: 0, offline: false }],
    }, ctx.agentA1Token);

    const after = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(after.data.name, 'Nombre manual del operador', 'La ingesta NO debe pisar el override');
    assert.equal(after.data.name_reported, 'firmware-host.local', 'Pero sí debe actualizar el valor reportado');

    // Volver al automático con "".
    const revert = await req('PUT', `/devices/${ctx.deviceId}`, { name: '' }, ctx.adminToken);
    assert.equal(revert.data.name_override, null);
    assert.equal(revert.data.name, 'firmware-host.local');
  });
});

describe('Ciclo de vida — dar de baja / reactivar', () => {
  test('decommission excluye del listado y del dashboard, pero la ficha e historial siguen', async () => {
    // Buscado por su serial único (no por el total global — con paginación real
    // el total de TODA la base no es un buen invariante para un test aislado).
    const serialQ = `q=SN-CONVERGE-${ts}`;
    const before = await req('GET', `/devices?${serialQ}`, undefined, ctx.adminToken);
    assert.equal(before.data.total, 1);

    const dec = await req('POST', `/devices/${ctx.deviceId}/decommission`, { reason: 'Prueba de baja' }, ctx.adminToken);
    assert.equal(dec.status, 200);
    assert.ok(dec.data.decommissioned_at);

    const after = await req('GET', `/devices?${serialQ}`, undefined, ctx.adminToken);
    assert.equal(after.data.total, 0);

    const withInclude = await req('GET', `/devices?${serialQ}&include=decommissioned`, undefined, ctx.adminToken);
    assert.ok(withInclude.data.items.some((d: any) => d.id === ctx.deviceId));

    const detail = await req('GET', `/devices/${ctx.deviceId}`, undefined, ctx.adminToken);
    assert.equal(detail.status, 200, 'La ficha debe seguir abriendo');

    const readings = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    assert.equal(readings.status, 200, 'El historial debe seguir siendo consultable');

    const clientDevices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    assert.ok(!clientDevices.data.some((d: any) => d.id === ctx.deviceId));

    const recomm = await req('POST', `/devices/${ctx.deviceId}/recommission`, {}, ctx.adminToken);
    assert.equal(recomm.status, 200);
    assert.equal(recomm.data.decommissioned_at, null);

    const afterRecomm = await req('GET', `/devices?${serialQ}`, undefined, ctx.adminToken);
    assert.ok(afterRecomm.data.items.some((d: any) => d.id === ctx.deviceId));
  });

  test('decommission sin reason → 400', async () => {
    const { status } = await req('POST', `/devices/${ctx.deviceId}/decommission`, {}, ctx.adminToken);
    assert.equal(status, 400);
  });
});

describe('Ciclo de vida — mover entre monitores/clientes', () => {
  test('mover al mismo cliente (otro monitor) preserva el historial de lecturas', async () => {
    const readingsBefore = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    const countBefore = readingsBefore.data.length;

    const move = await req('POST', `/devices/${ctx.deviceId}/move`,
      { agentId: ctx.agentA2Id, reason: 'Reasignación de prueba' }, ctx.adminToken);
    assert.equal(move.status, 200);
    assert.equal(move.data.agent_id, ctx.agentA2Id);

    const readingsAfter = await req('GET', `/devices/${ctx.deviceId}/readings`, undefined, ctx.adminToken);
    assert.equal(readingsAfter.data.length, countBefore, 'Mover no debe alterar el historial de lecturas');
  });

  test('mover a un cliente distinto sin confirmClientChange → 400', async () => {
    const { status } = await req('POST', `/devices/${ctx.deviceId}/move`,
      { agentId: ctx.agentBId, reason: 'Cambio de cliente' }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('mover a un cliente distinto CON confirmClientChange → 200, y el cliente nuevo lo ve', async () => {
    const move = await req('POST', `/devices/${ctx.deviceId}/move`,
      { agentId: ctx.agentBId, reason: 'Cambio de cliente confirmado', confirmClientChange: true }, ctx.adminToken);
    assert.equal(move.status, 200);
    assert.equal(move.data.client_id, ctx.clientBId);

    const inB = await req('GET', `/clients/${ctx.clientBId}/devices`, undefined, ctx.adminToken);
    assert.ok(inB.data.some((d: any) => d.id === ctx.deviceId));
    const inA = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    assert.ok(!inA.data.some((d: any) => d.id === ctx.deviceId));
  });

  test('mover un dispositivo inexistente → 404', async () => {
    const { status } = await req('POST', `/devices/00000000-0000-0000-0000-000000000000/move`,
      { agentId: ctx.agentBId, reason: 'Motivo de prueba' }, ctx.adminToken);
    assert.equal(status, 404);
  });
});

describe('Ciclo de vida — fusión manual de duplicados', () => {
  test('fusionar dos equipos con series disjuntas de lecturas: éxito, historial sumado, source queda lápida', async () => {
    // Reusa agentA1 (cliente A) — evita una activación extra: /agents/activate
    // tiene un rate-limit propio (5/min) y esta suite ya activa varios agentes.
    const clientId = ctx.clientAId;
    const agentToken = ctx.agentA1Token;

    // El "source" no tiene serial identificante (device_id === ip, el patrón
    // "sin serial real" que ya usa el resto del código) — un fantasma clásico,
    // el caso real que motiva la fusión manual. Con dos seriales reales
    // DISTINTOS el merge automático correctamente los rechazaría (guarda de
    // identidad física, probado aparte).
    const serialTarget = `SN-MERGE-TARGET-${ts}`;
    const ipSource = '10.20.1.2';
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: serialTarget, ip: '10.20.1.1', brand: 'hp',
        time: new Date(Date.now() - 10000).toISOString(), total_pages: 50, mono_pages: 50, color_pages: 0, offline: false }],
    }, agentToken);
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: ipSource, ip: ipSource, brand: 'hp',
        time: new Date().toISOString(), total_pages: 75, mono_pages: 75, color_pages: 0, offline: false }],
    }, agentToken);

    const devices = await req('GET', `/clients/${clientId}/devices`, undefined, ctx.adminToken);
    const target = devices.data.find((d: any) => d.serial_number === serialTarget);
    const source = devices.data.find((d: any) => d.ip_address === ipSource);
    assert.ok(target && source);

    const merge = await req('POST', `/devices/${target.id}/merge`, { sourceDeviceId: source.id }, ctx.adminToken);
    assert.equal(merge.status, 200);
    assert.equal(merge.data.keptId, target.id);
    assert.equal(merge.data.readingsMoved, 1);

    const sourceAfter = await req('GET', `/devices/${source.id}`, undefined, ctx.adminToken);
    assert.equal(sourceAfter.data.merged_into, target.id);

    const targetReadings = await req('GET', `/devices/${target.id}/readings`, undefined, ctx.adminToken);
    assert.equal(targetReadings.data.length, 2, 'El destino debe tener la suma de ambas series');

    const list = await req('GET', `/clients/${clientId}/devices`, undefined, ctx.adminToken);
    assert.ok(!list.data.some((d: any) => d.id === source.id), 'La lápida no debe listarse');

    // Repetir el mismo merge → 200 no-op idempotente.
    const again = await req('POST', `/devices/${target.id}/merge`, { sourceDeviceId: source.id }, ctx.adminToken);
    assert.equal(again.status, 200);
  });

  test('fusionar dos equipos de clientes DISTINTOS → 409', async () => {
    const merge = await req('POST', `/devices/${ctx.deviceId}/merge`,
      { sourceDeviceId: '00000000-0000-0000-0000-000000000000' }, ctx.adminToken);
    assert.equal(merge.status, 409);
  });

  test('fusionar un dispositivo consigo mismo → 400', async () => {
    const { status } = await req('POST', `/devices/${ctx.deviceId}/merge`, { sourceDeviceId: ctx.deviceId }, ctx.adminToken);
    assert.equal(status, 400);
  });
});

describe('Acciones en bloque (Fase 9 del gap analysis vs HP SDS) — dar de baja / reactivar', () => {
  const bulkCtx = { d1: '', d2: '' };

  test('setup: 2 equipos nuevos en el cliente A', async () => {
    const points = [`SN-BULK-DEC-1-${ts}`, `SN-BULK-DEC-2-${ts}`];
    for (const [i, serial] of points.entries()) {
      const sync = await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.30.1.${i + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, offline: false }],
      }, ctx.agentA1Token);
      assert.equal(sync.status, 200);
    }
    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    bulkCtx.d1 = devices.data.find((d: any) => d.serial_number === points[0]).id;
    bulkCtx.d2 = devices.data.find((d: any) => d.serial_number === points[1]).id;
  });

  test('dryRun clasifica pero no muta', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await req('POST', '/devices/bulk/decommission',
      { ids: [bulkCtx.d1, bulkCtx.d2, fakeId], reason: 'Prueba en bloque', dryRun: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);
    assert.deepEqual(res.data.applied.sort(), [bulkCtx.d1, bulkCtx.d2].sort());
    assert.equal(res.data.skipped.length, 1);
    assert.equal(res.data.skipped[0].reason, 'not_found');

    const d1 = await req('GET', `/devices/${bulkCtx.d1}`, undefined, ctx.adminToken);
    assert.equal(d1.data.decommissioned_at, null, 'dryRun no debe mutar nada');
  });

  test('confirmación real da de baja N equipos con una sola fila de audit', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await req('POST', '/devices/bulk/decommission',
      { ids: [bulkCtx.d1, bulkCtx.d2, fakeId], reason: 'Prueba en bloque' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);

    const d1 = await req('GET', `/devices/${bulkCtx.d1}`, undefined, ctx.adminToken);
    const d2 = await req('GET', `/devices/${bulkCtx.d2}`, undefined, ctx.adminToken);
    assert.ok(d1.data.decommissioned_at);
    assert.ok(d2.data.decommissioned_at);

    const logs = await req('GET', '/audit-logs?action=DEVICES_BULK_DECOMMISSIONED&limit=50', undefined, ctx.adminToken);
    const row = logs.data.items.find((i: any) => {
      const meta = typeof i.metadata === 'string' ? JSON.parse(i.metadata) : i.metadata;
      return meta?.device_ids?.includes(bulkCtx.d1) && meta?.device_ids?.includes(bulkCtx.d2);
    });
    assert.ok(row, 'debe existir una única fila de audit con ambos ids');
  });

  test('repetir sobre los mismos ids → ambos vuelven skipped (already_decommissioned)', async () => {
    const res = await req('POST', '/devices/bulk/decommission', { ids: [bulkCtx.d1, bulkCtx.d2], reason: 'De nuevo' }, ctx.adminToken);
    assert.equal(res.data.count, 0);
    assert.ok(res.data.skipped.every((s: any) => s.reason === 'already_decommissioned'));
  });

  test('sin reason → 400 (schema)', async () => {
    const { status } = await req('POST', '/devices/bulk/decommission', { ids: [bulkCtx.d1] }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('más de 500 ids → 400 (schema)', async () => {
    const ids = Array.from({ length: 501 }, () => crypto.randomUUID());
    const { status } = await req('POST', '/devices/bulk/decommission', { ids, reason: 'x' }, ctx.adminToken);
    assert.equal(status, 400);
  });

  test('reactivar en bloque', async () => {
    const res = await req('POST', '/devices/bulk/recommission', { ids: [bulkCtx.d1, bulkCtx.d2] }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);

    const d1 = await req('GET', `/devices/${bulkCtx.d1}`, undefined, ctx.adminToken);
    assert.equal(d1.data.decommissioned_at, null);
  });

  test('reactivar un equipo que no está de baja → skipped (not_decommissioned)', async () => {
    const res = await req('POST', '/devices/bulk/recommission', { ids: [bulkCtx.d1] }, ctx.adminToken);
    assert.equal(res.data.count, 0);
    assert.equal(res.data.skipped[0].reason, 'not_decommissioned');
  });
});

describe('Acciones en bloque — mover en bloque', () => {
  const bulkCtx = { d1: '', d2: '', collisionSerial: '' };

  test('setup: 2 equipos en agente A1 (cliente A), uno con serial que ya existe en el cliente B', async () => {
    bulkCtx.collisionSerial = `SN-BULK-MOVE-COLLIDE-${ts}`;
    const points = [`SN-BULK-MOVE-1-${ts}`, bulkCtx.collisionSerial];
    for (const [i, serial] of points.entries()) {
      const sync = await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.30.2.${i + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, offline: false }],
      }, ctx.agentA1Token);
      assert.equal(sync.status, 200);
    }
    // El mismo serial YA existe en el cliente B (vía agentBToken) — provoca colisión al mover a B.
    await req('POST', '/devices/sync', {
      readings: [{ reading_id: crypto.randomUUID(), device_id: bulkCtx.collisionSerial, ip: '10.30.3.1', brand: 'hp',
        time: new Date().toISOString(), total_pages: 5, offline: false }],
    }, ctx.agentBToken);

    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    bulkCtx.d1 = devices.data.find((d: any) => d.serial_number === points[0]).id;
    bulkCtx.d2 = devices.data.find((d: any) => d.serial_number === bulkCtx.collisionSerial).id;
  });

  test('mover al mismo cliente (otro monitor) — ambos aplican', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1, bulkCtx.d2], agentId: ctx.agentA2Id, reason: 'Reasignación en bloque' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);
  });

  test('mover de nuevo al mismo agente → skipped (same_agent)', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1], agentId: ctx.agentA2Id, reason: 'Otra vez' }, ctx.adminToken);
    assert.equal(res.data.count, 0);
    assert.equal(res.data.skipped[0].reason, 'same_agent');
  });

  test('mover a otro cliente sin confirmClientChange → skipped (confirm_required), no aborta todo el lote', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1], agentId: ctx.agentBId, reason: 'Cambio de cliente' }, ctx.adminToken);
    assert.equal(res.status, 200, 'a diferencia del endpoint single, el bulk nunca aborta con 400 por esto');
    assert.equal(res.data.count, 0);
    assert.equal(res.data.skipped[0].reason, 'confirm_required');
  });

  test('mover a otro cliente CON confirmClientChange, con colisión de serial en el destino → uno aplica, el otro queda skipped', async () => {
    const res = await req('POST', '/devices/bulk/move',
      { ids: [bulkCtx.d1, bulkCtx.d2], agentId: ctx.agentBId, reason: 'Cambio confirmado', confirmClientChange: true }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 1);
    assert.ok(res.data.applied.includes(bulkCtx.d1));
    const skip = res.data.skipped.find((s: any) => s.id === bulkCtx.d2);
    assert.equal(skip?.reason, 'collision');
  });
});

describe('Acciones en bloque — estado de monitoreo', () => {
  test('cambia el estado de 2 equipos de una', async () => {
    const points = [`SN-BULK-MON-1-${ts}`, `SN-BULK-MON-2-${ts}`];
    for (const [i, serial] of points.entries()) {
      await req('POST', '/devices/sync', {
        readings: [{ reading_id: crypto.randomUUID(), device_id: serial, ip: `10.30.4.${i + 1}`, brand: 'hp',
          time: new Date().toISOString(), total_pages: 10, offline: false }],
      }, ctx.agentA1Token);
    }
    const devices = await req('GET', `/clients/${ctx.clientAId}/devices`, undefined, ctx.adminToken);
    const ids = points.map((s) => devices.data.find((d: any) => d.serial_number === s).id);

    const res = await req('POST', '/devices/bulk/monitor-state', { ids, state: 'supplies_only' }, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.count, 2);

    for (const id of ids) {
      const d = await req('GET', `/devices/${id}`, undefined, ctx.adminToken);
      assert.equal(d.data.monitor_state, 'supplies_only');
    }
  });

  test('state inválido → 400 (schema)', async () => {
    const { status } = await req('POST', '/devices/bulk/monitor-state', { ids: [ctx.deviceId], state: 'no-existe' }, ctx.adminToken);
    assert.equal(status, 400);
  });
});
