// Resolvers en memoria del proxy EWS remoto — tests unitarios puros (sin WS
// real, eso se cubre en portalAgentEws.test.ts contra el stack Docker).
// Ejecutar: npx tsx --test src/tests/ewsProxyService.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  waitForEwsProxyResult,
  resolveEwsProxy,
  rejectEwsProxy,
  rejectAllPendingForAgent,
  _pendingCountForTests,
} from '../services/ewsProxyService';

const fakeResult = { status: 200, headers: {}, bodyBase64: 'aGVsbG8=', truncated: false };

describe('ewsProxyService — resolución básica', () => {
  test('resolveEwsProxy resuelve la promesa con el resultado', async () => {
    const p = waitForEwsProxyResult('cmd-1', 'agent-1', 5000);
    resolveEwsProxy('cmd-1', fakeResult);
    const result = await p;
    assert.deepEqual(result, fakeResult);
  });

  test('rejectEwsProxy rechaza la promesa con el mensaje de error', async () => {
    const p = waitForEwsProxyResult('cmd-2', 'agent-1', 5000);
    rejectEwsProxy('cmd-2', 'algo salió mal');
    await assert.rejects(p, /algo salió mal/);
  });

  test('resolver/rechazar un commandId que nadie está esperando no tira error', () => {
    assert.doesNotThrow(() => resolveEwsProxy('cmd-inexistente', fakeResult));
    assert.doesNotThrow(() => rejectEwsProxy('cmd-inexistente', 'x'));
  });
});

describe('ewsProxyService — timeout', () => {
  test('si nadie resuelve, rechaza por timeout', async () => {
    const before = _pendingCountForTests();
    const p = waitForEwsProxyResult('cmd-timeout', 'agent-1', 50);
    assert.equal(_pendingCountForTests(), before + 1);
    await assert.rejects(p, /Timeout/);
    assert.equal(_pendingCountForTests(), before, 'debe limpiarse del mapa tras el timeout');
  });
});

describe('ewsProxyService — idempotencia (doble resolución)', () => {
  test('resolver después del timeout no revive la promesa ya rechazada', async () => {
    const p = waitForEwsProxyResult('cmd-race', 'agent-1', 30);
    await assert.rejects(p, /Timeout/);
    // Llega tarde — no debe tirar, y no debe haber ningún efecto observable
    // (la promesa ya se resolvió/rechazó, JS ignora un segundo resolve/reject).
    assert.doesNotThrow(() => resolveEwsProxy('cmd-race', fakeResult));
  });

  test('resolver dos veces seguidas — la segunda es un no-op silencioso', async () => {
    const p = waitForEwsProxyResult('cmd-double', 'agent-1', 5000);
    resolveEwsProxy('cmd-double', fakeResult);
    resolveEwsProxy('cmd-double', { ...fakeResult, status: 500 }); // no debe pisar nada, ya se borró del mapa
    const result = await p;
    assert.equal(result.status, 200, 'debe quedar el PRIMER resultado, no el segundo');
  });
});

describe('ewsProxyService — desconexión del agente', () => {
  test('rejectAllPendingForAgent rechaza sólo las pendientes de ESE agente', async () => {
    const pA1 = waitForEwsProxyResult('cmd-a1', 'agent-A', 5000);
    const pA2 = waitForEwsProxyResult('cmd-a2', 'agent-A', 5000);
    const pB1 = waitForEwsProxyResult('cmd-b1', 'agent-B', 5000);

    rejectAllPendingForAgent('agent-A');

    await assert.rejects(pA1, /se desconectó/);
    await assert.rejects(pA2, /se desconectó/);

    // La de agent-B sigue pendiente — se resuelve normalmente.
    resolveEwsProxy('cmd-b1', fakeResult);
    assert.deepEqual(await pB1, fakeResult);
  });

  test('rejectAllPendingForAgent para un agente sin pendientes no rompe nada', () => {
    assert.doesNotThrow(() => rejectAllPendingForAgent('agent-sin-nada'));
  });
});
