// Plantillas de mensajes + opt-out de notificaciones por evento (Fase 4.3
// del gap analysis vs HP SDS, re-comparación 24/08/2026) — mismo criterio
// que scheduledReports.test.ts: unitarios puros del dominio + e2e contra el
// backend real.
// Ejecutar: API_URL=http://localhost:3000/api/v1 npx tsx --test src/tests/messageTemplates.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TEMPLATES,
  eventEnabledFor,
  renderTemplate,
} from '../modules/message-templates/domain/entities/message-template';

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

describe('Dominio puro — render y opt-out', () => {
  test('renderTemplate reemplaza placeholders y nunca deja {{...}} sin resolver', () => {
    const out = renderTemplate(
      { subject: 'Hola {{client_name}}', body: '{{a}} y {{b}} y {{ c }}' },
      { client_name: 'Acme', a: 'uno', b: null }
    );
    assert.equal(out.subject, 'Hola Acme');
    assert.equal(out.body, 'uno y — y —');
  });

  test('los defaults calcan los eventos y renderizan completos', () => {
    for (const [event, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
      const out = renderTemplate(tpl, {});
      assert.ok(!out.subject.includes('{{'), `${event}: subject sin placeholders sueltos`);
      assert.ok(!out.body.includes('{{'), `${event}: body sin placeholders sueltos`);
    }
  });

  test('eventEnabledFor: lista respeta contenido; valor no-array = habilitado (histórico)', () => {
    assert.equal(eventEnabledFor(['alert.created'], 'alert.created'), true);
    assert.equal(eventEnabledFor([], 'alert.created'), false);
    assert.equal(eventEnabledFor(null, 'alert.created'), true);
    assert.equal(eventEnabledFor('basura', 'alert.created'), true);
  });
});

const ts = Date.now();
const ctx = { adminToken: '', clientId: '', overrideId: '' };

describe('Plantillas — e2e', () => {
  test('setup: login + cliente', async () => {
    const login = await req('POST', '/portal/login', { username: USER, password: PASS });
    assert.equal(login.status, 200);
    ctx.adminToken = login.data.token;
    const client = await req('POST', '/clients', { name: `Templates Test Client ${ts}` }, ctx.adminToken);
    ctx.clientId = client.data.id;
  });

  test('GET sin filas → los 5 eventos con source=default', async () => {
    const res = await req('GET', '/message-templates', undefined, ctx.adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.data.length, 5);
    // sin plantilla global guardada, todo evento que no toque otro test es default
    const supply = res.data.find((t: any) => t.event === 'supply_request.completed');
    assert.equal(supply.source, 'default');
    assert.ok(Array.isArray(supply.placeholders) && supply.placeholders.length > 0);
  });

  test('PUT global → source=global y contenido nuevo', async () => {
    const put = await req('PUT', '/message-templates', {
      event: 'alert.created',
      subject: `[QA ${ts}] Alerta {{type}} en {{client_name}}`,
      body: 'Equipo {{target}}: {{message}}',
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    const res = await req('GET', '/message-templates', undefined, ctx.adminToken);
    const alert = res.data.find((t: any) => t.event === 'alert.created');
    assert.equal(alert.source, 'global');
    assert.ok(alert.subject.startsWith(`[QA ${ts}]`));
    assert.ok(alert.default_subject.includes('Alerta crítica'), 'el default sigue disponible');
  });

  test('PUT override de cliente → gana sobre la global', async () => {
    const put = await req('PUT', '/message-templates', {
      client_id: ctx.clientId, event: 'alert.created',
      subject: `[Cliente ${ts}] {{client_name}}`, body: 'Override: {{message}}',
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    ctx.overrideId = put.data.id;
    const res = await req('GET', `/message-templates?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    const alert = res.data.find((t: any) => t.event === 'alert.created');
    assert.equal(alert.source, 'client');
    assert.ok(alert.subject.startsWith(`[Cliente ${ts}]`));
  });

  test('DELETE del override → vuelve a la global', async () => {
    const del = await req('DELETE', `/message-templates/${ctx.overrideId}`, undefined, ctx.adminToken);
    assert.equal(del.status, 204);
    const res = await req('GET', `/message-templates?client_id=${ctx.clientId}`, undefined, ctx.adminToken);
    const alert = res.data.find((t: any) => t.event === 'alert.created');
    assert.equal(alert.source, 'global');
  });

  test('evento inválido → 400', async () => {
    const put = await req('PUT', '/message-templates', {
      event: 'no.existe', subject: 'x y z', body: 'a b c',
    }, ctx.adminToken);
    assert.equal(put.status, 400);
  });

  test('cleanup: borrar la plantilla global de QA', async () => {
    const res = await req('GET', '/message-templates', undefined, ctx.adminToken);
    const alert = res.data.find((t: any) => t.event === 'alert.created');
    if (alert.source === 'global' && alert.id) {
      const del = await req('DELETE', `/message-templates/${alert.id}`, undefined, ctx.adminToken);
      assert.equal(del.status, 204);
    }
  });
});

describe('Opt-out de eventos por cliente — e2e', () => {
  test('PUT /clients/:id con notification_events y lectura de vuelta', async () => {
    const put = await req('PUT', `/clients/${ctx.clientId}`, {
      notification_events: ['incident.created', 'report.closed'],
    }, ctx.adminToken);
    assert.equal(put.status, 200);
    const got = await req('GET', `/clients/${ctx.clientId}`, undefined, ctx.adminToken);
    assert.deepEqual(got.data.notification_events, ['incident.created', 'report.closed']);
  });

  test('evento fuera del catálogo → 400', async () => {
    const put = await req('PUT', `/clients/${ctx.clientId}`, {
      notification_events: ['algo.raro'],
    }, ctx.adminToken);
    assert.equal(put.status, 400);
  });

  test('un cliente nuevo arranca con todos los eventos (comportamiento histórico)', async () => {
    const client = await req('POST', '/clients', { name: `Templates Fresh Client ${ts}` }, ctx.adminToken);
    const got = await req('GET', `/clients/${client.data.id}`, undefined, ctx.adminToken);
    assert.equal(got.data.notification_events.length, 5);
  });
});
