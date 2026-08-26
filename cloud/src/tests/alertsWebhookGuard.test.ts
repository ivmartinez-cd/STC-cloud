// Guard SSRF de sendAlertWebhook + distinción 2xx/4xx-5xx de postWebhook.
// Separado de alerts.test.ts (deuda de sizes-baseline, 2026-08-26) sólo por
// tamaño de archivo; 100% puro (sin red real, sin servidor, sin login) —
// mockea `global.fetch` o nunca llega a llamarlo (el guard SSRF rechaza
// antes). Ejecutar: npx tsx --test src/tests/alertsWebhookGuard.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { sendAlertWebhook, postWebhook } from '../services/notificationService';

const dummyPayload = {
  alertId: 0, type: 'test', severity: 'critical', message: 'prueba',
  deviceName: null, agentName: null, clientId: 'dummy-client-id', clientName: 'Test',
};

describe('Notificaciones — guard SSRF del webhook (sin red: sólo los casos que no requieren DNS)', () => {
  test('rechaza http:// (exige https)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'http://example.com/hook'), /https/i);
  });

  test('rechaza loopback literal (127.0.0.1)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://127.0.0.1/hook'), /red interna/i);
  });

  test('rechaza el IP de metadata de nube (169.254.169.254)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://169.254.169.254/hook'), /red interna/i);
  });

  test('rechaza un rango privado RFC1918 (10.x)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://10.0.0.5/hook'), /red interna/i);
  });

  test('rechaza IPv6 loopback (::1)', async () => {
    await assert.rejects(sendAlertWebhook(dummyPayload, 'https://[::1]/hook'), /red interna/i);
  });
});

// Regresión del bug real (25/08/2026): `fetch` sólo rechaza ante una falla de
// RED, una 4xx/5xx del receptor resolvía la promesa igual que un 200 y el
// catch de cada worker nunca la veía. Se mockea `global.fetch` (sin red real,
// misma restricción que el describe de arriba) y se usa un IP público LITERAL
// (8.8.8.8) para que el guard SSRF no dispare una resolución DNS real —
// `isPrivateOrLoopbackIPv4` lo evalúa sin tocar la red.
describe('Notificaciones — postWebhook distingue 2xx de 4xx/5xx (fetch mockeado, sin red)', () => {
  const originalFetch = global.fetch;

  after(() => {
    global.fetch = originalFetch;
  });

  test('respuesta 500 hace que postWebhook rechace', async () => {
    global.fetch = (async () =>
      new Response('boom', { status: 500, statusText: 'Internal Server Error' })) as typeof fetch;
    await assert.rejects(postWebhook('https://8.8.8.8/hook', { hello: 'world' }), /respondió 500/);
  });

  test('respuesta 404 hace que postWebhook rechace', async () => {
    global.fetch = (async () => new Response('not found', { status: 404, statusText: 'Not Found' })) as typeof fetch;
    await assert.rejects(postWebhook('https://8.8.8.8/hook', { hello: 'world' }), /respondió 404/);
  });

  test('respuesta 200 hace que postWebhook resuelva sin lanzar', async () => {
    global.fetch = (async () => new Response('ok', { status: 200 })) as typeof fetch;
    await assert.doesNotReject(postWebhook('https://8.8.8.8/hook', { hello: 'world' }));
  });
});
