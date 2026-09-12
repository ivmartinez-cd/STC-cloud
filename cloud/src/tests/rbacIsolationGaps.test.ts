// Huecos de cobertura que dejó la auditoría de aislamiento del 12/09/2026, hecha
// al crear el primer `client_viewer` real en producción (usuario `issn`, cliente
// ISSN). La auditoría no encontró filtraciones, pero sí rutas de la allowlist sin
// ningún test cross-cliente. Acá se cubren las que no necesitan flota: el scope
// forzado frente a un `?client_id=` ajeno, y los tres formatos de export.
//
// Fixture propio y mínimo (2 clientes + 1 viewer) en vez de reusar el de
// `rbacDevicesSearch.test.ts`: ese archivo ya está al límite de tamaño y su setup
// activa agentes con rate-limit, que acá no hace falta.
//
// Correr con la API viva (ver memoria `suite-local-run-procedure`):
//   API_URL=http://localhost:3100/api/v1 npx tsx --test src/tests/rbacIsolationGaps.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const USER = process.env.PORTAL_ADMIN_USER || 'admin';
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
  clientAId: '',
  clientBId: '',
  viewerToken: '',
  viewerUser: `iso_viewer_${ts}`,
  viewerPass: 'IsoViewer1234!',
};

describe('Setup — dos clientes y un viewer atado al primero', () => {
  test('login admin', async () => {
    const { status, data } = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(status, 200);
    ctx.adminToken = data.token;
  });

  test('crear cliente A y cliente B', async () => {
    const a = await req('POST', '/clients', { name: `Iso Client A ${ts}` }, ctx.adminToken);
    assert.equal(a.status, 200);
    ctx.clientAId = a.data.id;
    const b = await req('POST', '/clients', { name: `Iso Client B ${ts}` }, ctx.adminToken);
    assert.equal(b.status, 200);
    ctx.clientBId = b.data.id;
  });

  test('crear client_viewer del cliente A y loguearlo', async () => {
    const created = await req('POST', '/portal/users', {
      username: ctx.viewerUser, password: ctx.viewerPass, role: 'client_viewer', client_id: ctx.clientAId,
    }, ctx.adminToken);
    assert.equal(created.status, 200);
    const login = await req('POST', '/portal/login', { username: ctx.viewerUser, password: ctx.viewerPass });
    assert.equal(login.status, 200);
    ctx.viewerToken = login.data.token;
  });
});

/**
 * El scope FUERZA el cliente del usuario, no coexiste con el query param: pedir el
 * de otro tiene que dar vacío (AND), nunca ampliar. Es el patrón más fácil de
 * romper en una refactorización — alcanza con cambiar el ternario del scope por
 * un `??` para convertirlo en una filtración.
 */
describe('El ?client_id= de otro cliente no amplía el alcance', () => {
  for (const ruta of ['/alerts', '/supplies', '/incidents', '/supply-requests']) {
    test(`${ruta} ignora el client_id ajeno`, async () => {
      const { status, data } = await req('GET', `${ruta}?client_id=${ctx.clientBId}`, undefined, ctx.viewerToken);
      assert.ok(status === 200 || status === 404, `esperaba 200 o 404, vino ${status}`);
      if (status !== 200) return;
      const items = Array.isArray(data) ? data : (data.items ?? []);
      for (const it of items) {
        if (it.client_id !== undefined) {
          assert.equal(it.client_id, ctx.clientAId, 'apareció una fila de otro cliente');
        }
      }
    });
  }

  test('/alerts/count nunca supera el conteo global', async () => {
    const propio = await req('GET', '/alerts/count', undefined, ctx.viewerToken);
    assert.equal(propio.status, 200);
    const global = await req('GET', '/alerts/count', undefined, ctx.adminToken);
    assert.ok(propio.data.total <= global.data.total, 'el conteo del cliente no puede superar al de toda la red');
  });
});

describe('Exports de un cierre de facturación', () => {
  /**
   * Regresión del 12/09/2026: `export.pdf` faltaba en `CLIENT_VIEWER_ROUTES`
   * mientras csv y xlsx sí estaban, así que el cliente abría una pestaña con el
   * JSON del 403. Con un cierre inexistente tiene que dar 404 (pasó el filtro de
   * rol y no encontró el cierre); un 403 acá significa que la política volvió atrás.
   */
  test('el PDF del propio cliente ya no lo bloquea el rol', async () => {
    const inexistente = crypto.randomUUID();
    const { status } = await req('GET', `/clients/${ctx.clientAId}/reports/${inexistente}/export.pdf`, undefined, ctx.viewerToken);
    assert.notEqual(status, 403, 'el PDF quedó fuera del allowlist otra vez');
    assert.equal(status, 404);
  });

  test('los tres formatos se comportan igual', async () => {
    const inexistente = crypto.randomUUID();
    for (const fmt of ['csv', 'xlsx', 'pdf']) {
      const { status } = await req('GET', `/clients/${ctx.clientAId}/reports/${inexistente}/export.${fmt}`, undefined, ctx.viewerToken);
      assert.equal(status, 404, `export.${fmt} debería dar 404, dio ${status}`);
    }
  });

  /**
   * Única ruta de la allowlist donde la propiedad depende de un SEGUNDO id: el
   * gate central valida el `:id` del cliente y el use case valida el `closureId`
   * con `findOwned`. Acá se prueba la primera barrera.
   */
  test('con el :id de otro cliente no se llega ni a mirar el cierre', async () => {
    const inexistente = crypto.randomUUID();
    const { status } = await req('GET', `/clients/${ctx.clientBId}/reports/${inexistente}/export.csv`, undefined, ctx.viewerToken);
    assert.equal(status, 404);
  });
});

describe('Agregados globales', () => {
  test('/devices/summary no deja contar los clientes de la red', async () => {
    const { status, data } = await req('GET', '/devices/summary', undefined, ctx.viewerToken);
    assert.equal(status, 200);
    // El fixture creó 2 clientes: si el agregado no estuviera scopeado, este
    // número reflejaría la red entera en vez del único cliente del usuario.
    if (data.clients_total !== undefined) {
      assert.ok(data.clients_total <= 1, `clients_total=${data.clients_total} revela otros clientes`);
    }
  });

  test('/devices/directory no lista equipos de otros clientes', async () => {
    const { status, data } = await req('GET', '/devices/directory', undefined, ctx.viewerToken);
    assert.equal(status, 200);
    for (const row of data.items ?? []) {
      assert.equal(row.client_id, ctx.clientAId, 'apareció un equipo de otro cliente');
    }
  });
});
