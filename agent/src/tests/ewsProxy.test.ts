// Proxy EWS remoto (agent side) — tests de integración con un servidor HTTP
// local real, no mocks de socket.
// Run: npx tsx --test src/tests/ewsProxy.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { proxyEwsRequest } from '../capture/transport/http';

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as any).port }));
  });
}

describe('proxyEwsRequest — respuesta normal', () => {
  test('devuelve status/headers/body en base64 correctamente', async () => {
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>EWS de prueba</html>');
    });
    try {
      const result = await proxyEwsRequest('127.0.0.1', '/status.html', 1024 * 1024, 3000, port);
      assert.ok(result);
      assert.equal(result?.status, 200);
      assert.equal(Buffer.from(result!.bodyBase64, 'base64').toString('utf8'), '<html>EWS de prueba</html>');
      assert.equal(result?.truncated, false);
    } finally {
      server.close();
    }
  });

  test('body binario (ej. imagen) sobrevive intacto en base64', async () => {
    const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff, 0xfe]); // firma PNG-like
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(binaryData);
    });
    try {
      const result = await proxyEwsRequest('127.0.0.1', '/status.png', 1024 * 1024, 3000, port);
      assert.ok(result);
      assert.deepEqual(Buffer.from(result!.bodyBase64, 'base64'), binaryData);
    } finally {
      server.close();
    }
  });

  test('descomprime gzip correctamente', async () => {
    const original = '<html>' + 'x'.repeat(500) + '</html>';
    const gzipped = zlib.gzipSync(original);
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      res.end(gzipped);
    });
    try {
      const result = await proxyEwsRequest('127.0.0.1', '/gz.html', 1024 * 1024, 3000, port);
      assert.equal(Buffer.from(result!.bodyBase64, 'base64').toString('utf8'), original);
    } finally {
      server.close();
    }
  });
});

describe('proxyEwsRequest — tope de tamaño', () => {
  test('corta la descarga apenas se supera maxBytes, marca truncated', async () => {
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      // Manda de a chunks para que el corte ocurra a mitad de stream, no de un solo write.
      const chunk = 'a'.repeat(1000);
      let sent = 0;
      const interval = setInterval(() => {
        if (sent >= 5000) { clearInterval(interval); res.end(); return; }
        res.write(chunk);
        sent += chunk.length;
      }, 5);
    });
    try {
      const result = await proxyEwsRequest('127.0.0.1', '/big.txt', 2000, 3000, port);
      assert.ok(result);
      assert.equal(result?.truncated, true);
      assert.ok(Buffer.from(result!.bodyBase64, 'base64').length <= 2000 + 1000, 'no debe acumular mucho más allá del tope (un chunk de margen)');
    } finally {
      server.close();
    }
  });
});

describe('proxyEwsRequest — errores de red', () => {
  test('conexión rechazada (puerto cerrado) → null', async () => {
    const result = await proxyEwsRequest('127.0.0.1', '/nada', 1024, 500);
    assert.equal(result, null);
  });

  test('timeout (servidor nunca responde) → null', async () => {
    const { server, port } = await startServer((req, res) => { /* nunca responde */ });
    try {
      const result = await proxyEwsRequest('127.0.0.1', '/lento', 1024, 200, port);
      assert.equal(result, null);
    } finally {
      server.close();
    }
  });
});
