// Relay de EWS para el gateway de EWS remoto (agent side) — el que permite
// NAVEGAR el EWS del equipo, no sólo leer una página. Tests de integración
// contra un servidor HTTP local real, no mocks de socket.
// Run: npx tsx --test src/tests/ewsRequest.test.ts
//
// Lo que se cubre es lo que `proxyEwsRequest` no hacía y ahora sí: método,
// headers (cookie/authorization), body, y que los headers de conexión no se
// filtren en ninguna de las dos direcciones. La allowlist de IP contra
// `known_devices` — que es el control que sostiene todo esto — se testea en
// `commandHandlerEwsRequest.test.ts`, a nivel del comando.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { ewsRequest } from '../capture/transport/http';

interface Captured {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse, captured: Captured) => void) {
  const captured: Captured = { headers: {}, body: '' };
  return new Promise<{ server: http.Server; port: number; captured: Captured }>((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        captured.method = req.method;
        captured.url = req.url;
        captured.headers = req.headers;
        captured.body = Buffer.concat(chunks).toString('utf8');
        handler(req, res, captured);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, captured }));
  });
}

const ok = (res: http.ServerResponse) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); };

describe('ewsRequest — relay de método y cuerpo', () => {
  test('un POST con formulario llega al equipo tal cual (method, content-type y body)', async () => {
    const { server, port, captured } = await startServer((_req, res) => ok(res));
    try {
      const form = 'user=admin&password=1234';
      const result = await ewsRequest('127.0.0.1', '/login.cgi', 1024 * 1024, {
        method: 'POST', port,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        bodyBase64: Buffer.from(form).toString('base64'),
      }, 3000);
      assert.equal(result.ok, true);
      assert.equal(captured.method, 'POST');
      assert.equal(captured.url, '/login.cgi');
      assert.equal(captured.body, form);
      assert.equal(captured.headers['content-type'], 'application/x-www-form-urlencoded');
      // Lo calcula el relay a partir del body: si viniera del navegador y no coincidiera, el equipo colgaría esperando bytes.
      assert.equal(captured.headers['content-length'], String(form.length));
    } finally { server.close(); }
  });

  test('cookie y authorization se relayan — sin eso no hay sesión ni Basic auth en el equipo', async () => {
    const { server, port, captured } = await startServer((_req, res) => ok(res));
    try {
      await ewsRequest('127.0.0.1', '/x', 1024 * 1024, {
        port, headers: { cookie: 'SESSIONID=abc', authorization: 'Basic YWRtaW46MTIzNA==' },
      }, 3000);
      assert.equal(captured.headers.cookie, 'SESSIONID=abc');
      assert.equal(captured.headers.authorization, 'Basic YWRtaW46MTIzNA==');
    } finally { server.close(); }
  });

  test('un método no relayable se rechaza sin tocar la red', async () => {
    const result = await ewsRequest('127.0.0.1', '/x', 1024, { method: 'TRACE', port: 1 }, 500);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : '', /no relayable/i);
  });
});

describe('ewsRequest — higiene de headers', () => {
  test('los headers de conexión del navegador no se reenvían al equipo', async () => {
    const { server, port, captured } = await startServer((_req, res) => ok(res));
    try {
      await ewsRequest('127.0.0.1', '/x', 1024 * 1024, {
        port, headers: { connection: 'upgrade', upgrade: 'websocket', 'transfer-encoding': 'chunked', host: 'otro-host' },
      }, 3000);
      assert.equal(captured.headers.upgrade, undefined);
      assert.equal(captured.headers['transfer-encoding'], undefined);
      assert.notEqual(captured.headers.host, 'otro-host', 'el Host lo pone el relay, no el navegador');
    } finally { server.close(); }
  });

  test('un header con CRLF no puede inyectar headers extra', async () => {
    const { server, port, captured } = await startServer((_req, res) => ok(res));
    try {
      await ewsRequest('127.0.0.1', '/x', 1024 * 1024, {
        port, headers: { 'x-malo': 'valor\r\nX-Inyectado: si' },
      }, 3000);
      assert.equal(captured.headers['x-inyectado'], undefined);
      assert.equal(captured.headers['x-malo'], undefined, 'el header entero se descarta, no se sanea a medias');
    } finally { server.close(); }
  });

  test('content-encoding y content-length NO vuelven al navegador: el body ya viene descomprimido', async () => {
    const payload = '<html>' + 'x'.repeat(500) + '</html>';
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      res.end(zlib.gzipSync(Buffer.from(payload)));
    });
    try {
      const result = await ewsRequest('127.0.0.1', '/x', 1024 * 1024, { port }, 3000);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(Buffer.from(result.response.bodyBase64, 'base64').toString('utf8'), payload);
      assert.equal(result.response.headers['content-encoding'], undefined);
      assert.equal(result.response.headers['content-length'], undefined);
      assert.equal(result.response.headers['content-type'], 'text/html');
    } finally { server.close(); }
  });

  test('set-cookie vuelve aparte: lo guarda el gateway, no el navegador', async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Set-Cookie': ['SESSIONID=xyz; Path=/', 'lang=es'] });
      res.end('ok');
    });
    try {
      const result = await ewsRequest('127.0.0.1', '/x', 1024 * 1024, { port }, 3000);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.deepEqual(result.response.setCookie, ['SESSIONID=xyz; Path=/', 'lang=es']);
      assert.equal(result.response.headers['set-cookie'], undefined);
    } finally { server.close(); }
  });
});

describe('ewsRequest — redirects y errores', () => {
  test('NO sigue el redirect: se lo devuelve al navegador, que ya sabe seguirlo', async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(302, { Location: '/sws/index.html' });
      res.end();
    });
    try {
      const result = await ewsRequest('127.0.0.1', '/', 1024 * 1024, { port }, 3000);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.response.status, 302);
      assert.equal(result.response.headers.location, '/sws/index.html');
    } finally { server.close(); }
  });

  test('conexión rechazada devuelve el código, no un null opaco', async () => {
    // Puerto 1 en loopback: nada escuchando, falla al instante.
    const result = await ewsRequest('127.0.0.1', '/x', 1024, { port: 1 }, 2000);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : '', 'ECONNREFUSED');
  });

  test('el tope de tamaño sigue cortando en streaming', async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(50_000, 0x41));
    });
    try {
      const result = await ewsRequest('127.0.0.1', '/grande.bin', 1024, { port }, 3000);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.response.truncated, true);
    } finally { server.close(); }
  });
});
