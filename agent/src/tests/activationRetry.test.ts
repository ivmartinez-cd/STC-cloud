// Reintento de activación offline (backoff sólo ante error de red) — tests
// unitarios. `sleepFn` inyectado para no esperar los delays reales.
// Run: npx tsx --test src/tests/activationRetry.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { activateWithRetry, isNetworkError } from '../core/CliCommands';

function networkErr(msg = 'fetch failed'): Error {
  return new Error(msg);
}
function authErr(exitCode: number): Error & { _stcExitCode: number } {
  return Object.assign(new Error('Credenciales inválidas'), { _stcExitCode: exitCode });
}

describe('isNetworkError', () => {
  test('clasifica fetch failed / timeouts como error de red', () => {
    assert.equal(isNetworkError(networkErr('fetch failed')), true);
    assert.equal(isNetworkError(Object.assign(new Error(''), { code: 'ECONNREFUSED' })), true);
    assert.equal(isNetworkError(Object.assign(new Error(''), { name: 'AbortError' })), true);
  });

  test('un error genérico no se clasifica como de red', () => {
    assert.equal(isNetworkError(new Error('algo raro')), false);
  });
});

describe('activateWithRetry', () => {
  test('éxito en el primer intento — no reintenta', async () => {
    let calls = 0;
    const result = await activateWithRetry(
      async () => { calls++; return { agentId: 'a1', token: 't', refresh_token: 'r' }; },
      [10, 10, 10],
      async () => {}
    );
    assert.deepEqual(result, { agentId: 'a1', token: 't', refresh_token: 'r' });
    assert.equal(calls, 1);
  });

  test('error de red: reintenta hasta que funciona, sin esperar delays reales', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const result = await activateWithRetry(
      async () => {
        calls++;
        if (calls < 3) throw networkErr();
        return { agentId: 'a2', token: 't', refresh_token: 'r' };
      },
      [10, 20, 30],
      async (ms) => { sleeps.push(ms); }
    );
    assert.equal(calls, 3, 'debe haber reintentado 2 veces antes de funcionar a la 3ra');
    assert.deepEqual(sleeps, [10, 20]);
    assert.ok(result);
  });

  test('clave inválida (_stcExitCode) → NO reintenta, tira de inmediato', async () => {
    let calls = 0;
    await assert.rejects(
      () => activateWithRetry(
        async () => { calls++; throw authErr(2); },
        [10, 10, 10],
        async () => {}
      ),
      /Credenciales inválidas/
    );
    assert.equal(calls, 1, 'una key inválida no debe reintentarse');
  });

  test('error de red agota todos los reintentos → tira el último error', async () => {
    let calls = 0;
    await assert.rejects(
      () => activateWithRetry(
        async () => { calls++; throw networkErr('fetch failed'); },
        [10, 10],
        async () => {}
      )
    );
    assert.equal(calls, 3, '2 reintentos + el intento original = 3 llamadas');
  });

  test('onRetry se llama con el mensaje de error y el delay antes de cada reintento', async () => {
    const seen: Array<{ msg: string; delay: number }> = [];
    let calls = 0;
    await activateWithRetry(
      async () => { calls++; if (calls < 2) throw networkErr('fetch failed'); return { agentId: 'x', token: 't', refresh_token: 'r' }; },
      [50],
      async () => {},
      (msg, delay) => seen.push({ msg, delay })
    );
    assert.deepEqual(seen, [{ msg: 'fetch failed', delay: 50 }]);
  });
});
