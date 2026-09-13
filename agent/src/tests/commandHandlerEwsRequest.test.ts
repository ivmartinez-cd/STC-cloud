// CommandHandler — caso EWS_REQUEST (el relay que usa el gateway de EWS
// remoto del portal para que el operador NAVEGUE el EWS del equipo).
// Run: npx tsx --test src/tests/commandHandlerEwsRequest.test.ts
//
// A diferencia de `EWS_PROXY`, este comando ya no es GET-only: puede escribir
// contra el firmware del equipo. Lo único que separa "el operador navega la
// impresora del cliente" de "cualquier IP de la LAN del cliente es alcanzable
// desde la nube" es la allowlist contra `known_devices` — por eso los tres
// primeros tests son sobre eso, y son los que no hay que aflojar nunca.
//
// El puerto sí es inyectable acá (el gateway lo necesita para el sondeo
// HTTP/HTTPS), así que el camino feliz se prueba de verdad contra un servidor
// local, no sólo la validación.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CommandHandler } from '../core/CommandHandler';

const errorOf = (result: { result: unknown }) => (result.result as { error: string }).error;

describe('CommandHandler — EWS_REQUEST: allowlist', () => {
  test('IP no conocida → error, nunca hace el request real', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => false);
    const result = await handler.handleCommand('EWS_REQUEST', { ip: '10.0.0.9', path: '/x' }, 'cmd-1');
    assert.equal(result.status, 'error');
    assert.match(errorOf(result), /known_devices/);
  });

  test('sin setKnownDeviceCheck configurado → fail-closed, rechaza igual', async () => {
    const handler = new CommandHandler();
    const result = await handler.handleCommand('EWS_REQUEST', { ip: '127.0.0.1', path: '/x' }, 'cmd-2');
    assert.equal(result.status, 'error');
    assert.match(errorOf(result), /known_devices/);
  });

  test('un POST contra una IP no conocida tampoco pasa: escribir no es una excepción', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck((ip) => ip === '10.0.0.1');
    const result = await handler.handleCommand('EWS_REQUEST', {
      ip: '10.0.0.2', path: '/set', method: 'POST', bodyBase64: Buffer.from('a=1').toString('base64'),
    }, 'cmd-3');
    assert.equal(result.status, 'error');
    assert.match(errorOf(result), /known_devices/);
  });

  test('path que no empieza con "/" → error', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => true);
    const result = await handler.handleCommand('EWS_REQUEST', { ip: '127.0.0.1', path: 'sin-barra' }, 'cmd-4');
    assert.equal(result.status, 'error');
    assert.match(errorOf(result), /path inválido/);
  });
});

describe('CommandHandler — EWS_REQUEST: camino feliz', () => {
  test('IP conocida → relaya el POST y devuelve status, headers, cookies y body', async () => {
    let receivedBody = '';
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'SESSIONID=abc; Path=/' });
        res.end('<html>adentro</html>');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    try {
      const handler = new CommandHandler();
      handler.setKnownDeviceCheck((ip) => ip === '127.0.0.1');
      const result = await handler.handleCommand('EWS_REQUEST', {
        ip: '127.0.0.1', path: '/login.cgi', method: 'POST', port,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        bodyBase64: Buffer.from('user=admin').toString('base64'),
      }, 'cmd-5');

      assert.equal(result.status, 'success');
      const payload = result.result as { status: number; setCookie: string[]; bodyBase64: string; protocol: string };
      assert.equal(receivedBody, 'user=admin');
      assert.equal(payload.status, 200);
      assert.deepEqual(payload.setCookie, ['SESSIONID=abc; Path=/']);
      assert.equal(Buffer.from(payload.bodyBase64, 'base64').toString('utf8'), '<html>adentro</html>');
      // El gateway fija este valor en la sesión para no volver a sondear en cada recurso de la página.
      assert.equal(payload.protocol, 'http');
    } finally { server.close(); }
  });

  test('con el puerto fijado no hay sondeo a HTTPS: el error del equipo se devuelve tal cual', async () => {
    const handler = new CommandHandler();
    handler.setKnownDeviceCheck(() => true);
    const result = await handler.handleCommand('EWS_REQUEST', { ip: '127.0.0.1', path: '/x', port: 1 }, 'cmd-6');
    assert.equal(result.status, 'error');
    assert.match(errorOf(result), /ECONNREFUSED/);
  });
});
