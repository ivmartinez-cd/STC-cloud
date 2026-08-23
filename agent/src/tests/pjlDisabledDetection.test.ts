// Detección de "PJL deshabilitado" — tests de integración con un servidor
// TCP local real (no mocks de socket: se ejercita el flujo completo de
// readDeviceViaPJL contra una conexión de verdad).
// Run: npx tsx --test src/tests/pjlDisabledDetection.test.ts

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import {
  readDeviceViaPJL,
  getPjlConsecutiveFailures,
  resetPjlFailureTracking,
} from '../snmp/pjl';

/** Servidor que acepta la conexión pero nunca responde nada — simula un firewall/driver bloqueando PJL. */
function startSilentServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => { /* nunca escribe nada */ });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as net.AddressInfo).port });
    });
  });
}

/** Servidor que responde con una respuesta PJL válida — simula un equipo real con PJL habilitado. */
function startPjlServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on('data', () => {
        socket.write('@PJL INFO ID\r\n"HP LaserJet Test"\r\n@PJL INFO SERIALNUMBER\r\nSN123\r\n@PJL INFO PAGECOUNT\r\n4242\r\n');
        socket.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as net.AddressInfo).port });
    });
  });
}

describe('PJL — detección de deshabilitado tras fallos consecutivos', () => {
  test('3 fallos consecutivos → contador llega a 3 (umbral de log)', async () => {
    const { server, port } = await startSilentServer();
    const ip = '127.0.0.1';
    resetPjlFailureTracking();
    try {
      for (let i = 0; i < 3; i++) {
        const result = await readDeviceViaPJL(ip, port, 200);
        assert.equal(result, null, `intento ${i + 1} debe fallar (servidor silencioso)`);
      }
      assert.equal(getPjlConsecutiveFailures(ip), 3);
    } finally {
      server.close();
    }
  });

  test('una respuesta exitosa resetea el contador', async () => {
    const ip = '127.0.0.1';
    resetPjlFailureTracking();

    const silent = await startSilentServer();
    await readDeviceViaPJL(ip, silent.port, 200);
    await readDeviceViaPJL(ip, silent.port, 200);
    assert.equal(getPjlConsecutiveFailures(ip), 2);
    silent.server.close();

    const real = await startPjlServer();
    try {
      const result = await readDeviceViaPJL(ip, real.port, 500);
      assert.ok(result, 'debe parsear la respuesta PJL real');
      assert.equal(result?.totalPages, 4242);
      assert.equal(getPjlConsecutiveFailures(ip), 0, 'un éxito debe resetear el contador de fallos');
    } finally {
      real.server.close();
    }
  });

  test('IPs distintas tienen contadores independientes', async () => {
    resetPjlFailureTracking();
    const { server, port } = await startSilentServer();
    try {
      await readDeviceViaPJL('127.0.0.1', port, 200);
      assert.equal(getPjlConsecutiveFailures('127.0.0.1'), 1);
      assert.equal(getPjlConsecutiveFailures('10.0.0.99'), 0, 'IP nunca consultada empieza en 0');
    } finally {
      server.close();
    }
  });
});
