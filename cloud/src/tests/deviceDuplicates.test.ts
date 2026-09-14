// Heurística de duplicados (`GET /devices/duplicates`, `DUPLICATES_SQL`) —
// regresión de la auditoría del 27/08/2026 contra la flota real: 6 impresoras
// HP distintas (seriales y MACs distintos) que reportan el modelo como hostname
// producían 15 "pares duplicados" falsos, y 3 equipos que pasaron por la misma
// IP DHCP en días distintos, otros 3. Dos seriales identificantes distintos
// son dos equipos físicos, se parezcan en lo que se parezcan.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/deviceDuplicates.test.ts

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
  const res = await fetch(`${API}${path}`, { method, headers, body: isBodyless ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data as any };
}

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', agentToken: '' };

type Reading = { device_id: string; ip: string; mac?: string; hostname?: string; model?: string; total_pages: number };

function reading(r: Reading) {
  return {
    reading_id: crypto.randomUUID(), device_id: r.device_id, ip: r.ip, brand: 'hp',
    mac: r.mac, hostname: r.hostname, model: r.model,
    time: new Date().toISOString(), total_pages: r.total_pages, mono_pages: r.total_pages, color_pages: 0, offline: false,
  };
}

async function sync(readings: Reading[]) {
  const res = await req('POST', '/devices/sync', { readings: readings.map(reading) }, ctx.agentToken);
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

async function duplicates() {
  const res = await req('GET', `/devices/duplicates?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
  assert.equal(res.status, 200);
  return res.data as Array<{ a_serial: string | null; b_serial: string | null; a_hostname: string | null; reason: string }>;
}

function pairOf(rows: Awaited<ReturnType<typeof duplicates>>, s1: string, s2: string) {
  return rows.find((r) => (r.a_serial === s1 && r.b_serial === s2) || (r.a_serial === s2 && r.b_serial === s1));
}

describe('Duplicados — fixtures', () => {
  test('Setup: login admin + cliente + agente activado', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const client = await req('POST', '/clients', { name: `Dup Test ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
    const agent = await req('POST', '/agents', { clientId: ctx.clientId, name: 'Sede Dup' }, ctx.adminToken);
    const activated = await req('POST', '/agents/activate', { key: agent.data.key, hardwareId: `HW-dup-${ts}` });
    ctx.agentToken = activated.data.token;
  });
});

describe('Duplicados — dos seriales identificantes distintos NUNCA son duplicados', () => {
  test('mismo hostname (= modelo, default de HP), MACs e IPs distintas → 0 pares', async () => {
    const model = 'HP LaserJet E50145';
    await sync([
      { device_id: `BRBSN6THFM${ts}`, ip: '10.30.1.52', mac: 'b0:0c:d1:b8:01:5f', hostname: model, model, total_pages: 10 },
      { device_id: `BRBSN6PGCY${ts}`, ip: '10.30.1.51', mac: 'b0:0c:d1:b8:11:6c', hostname: model, model, total_pages: 20 },
    ]);
    const rows = await duplicates();
    assert.equal(pairOf(rows, `BRBSN6THFM${ts}`, `BRBSN6PGCY${ts}`), undefined, 'hostname = modelo no identifica un equipo');
  });

  test('misma IP en el mismo monitor (DHCP reasignada), seriales distintos → 0 pares', async () => {
    await sync([{ device_id: `ZELLBJEJ500022L${ts}`, ip: '10.30.1.6', mac: '84:25:19:0e:87:c9', hostname: `SEC1-${ts}`, total_pages: 5 }]);
    await sync([{ device_id: `ZELLBJFK200042T${ts}`, ip: '10.30.1.6', mac: '84:25:19:32:42:1a', hostname: `SEC2-${ts}`, total_pages: 7 }]);
    const rows = await duplicates();
    assert.equal(pairOf(rows, `ZELLBJEJ500022L${ts}`, `ZELLBJFK200042T${ts}`), undefined, 'IP compartida con seriales reales distintos no es duplicado');
  });
});

describe('Duplicados — coincidencias reales siguen detectándose', () => {
  test('misma MAC con seriales distintos (serial mal leído) → 1 par same_mac', async () => {
    const mac = 'b0:0c:d1:be:f0:ea';
    await sync([{ device_id: `BRBSM6S4XV${ts}`, ip: '10.30.1.70', mac, hostname: `SEC001599A94970${ts}`, total_pages: 5 }]);
    await sync([{ device_id: `Z5MABJIC70000BY${ts}`, ip: '10.30.1.71', mac, hostname: `SEC001599A94970${ts}`, total_pages: 5 }]);
    const pair = pairOf(await duplicates(), `BRBSM6S4XV${ts}`, `Z5MABJIC70000BY${ts}`);
    assert.ok(pair, 'misma MAC física debe seguir siendo duplicado');
    assert.equal(pair!.reason, 'same_mac');
    // La tarjeta muestra el hostname como clave de coincidencia; la fila lo expone.
    assert.ok('a_hostname' in pair!, 'la fila expone a_hostname');
  });

  test('una MAC de relleno compartida por 3 equipos con seriales distintos → 0 pares', async () => {
    // Caso real de ISSN (14/09/2026): tres HP 604CDD distintas reportan
    // `00:00:f0:a0:00:00`. Una MAC física no puede estar en tres equipos vivos.
    const mac = '00:00:f0:a0:00:00';
    const serials = [`CNB1N3T4N8${ts}`, `CNB2N2WYBD${ts}`, `CNB1N3T4MM${ts}`];
    for (const [i, serial] of serials.entries()) {
      await sync([{ device_id: serial, ip: `10.31.1.${70 + i}`, mac, hostname: 'HP604CDD', model: 'HP LaserJet 604CDD', total_pages: 5 }]);
    }
    const rows = await duplicates();
    for (let i = 0; i < serials.length; i++) {
      for (let j = i + 1; j < serials.length; j++) {
        assert.equal(pairOf(rows, serials[i], serials[j]), undefined, `${serials[i]} ↔ ${serials[j]} no es duplicado: la MAC es de relleno`);
      }
    }
  });

  // No hay test del caso `ghost_same_ip` vía API: el sync nunca crea un
  // "fantasma" (serial = IP) al lado de un equipo real en la misma IP — la
  // escalera serial → mac → ip lo adopta/fusiona. Sólo aparece con datos
  // heredados, y la rama del CASE que lo detecta no cambió en esta corrección.
});
