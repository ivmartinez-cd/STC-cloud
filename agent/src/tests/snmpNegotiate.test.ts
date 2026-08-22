// Negociación de credenciales SNMP (transport/snmp.ts) — unitario con sesiones
// falsas inyectadas por el seam del constructor (mismo criterio que `FakeSnmp`
// en capture.test.ts, sin mockear el módulo `net-snmp` completo).
// Ejecutar: npx tsx --test src/tests/snmpNegotiate.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import snmp from 'net-snmp';
import { SnmpClient, type SnmpCredential } from '../capture/transport/snmp';

type FakeOutcome = 'ok' | 'auth-rejected' | 'timeout';

function fakeSession(outcome: FakeOutcome): snmp.Session {
  return {
    get: (oids: string[], cb: (err: Error | null, varbinds: snmp.Varbind[]) => void) => {
      if (outcome === 'ok') {
        cb(null, [{ oid: oids[0], type: 4, value: 'fake-value' }]);
      } else if (outcome === 'auth-rejected') {
        const err = new snmp.ResponseInvalidError('Wrong Digest (incorrect password, community or key)');
        (err as any).code = snmp.ResponseInvalidCode.EAuthFailure;
        cb(err, undefined as unknown as snmp.Varbind[]);
      } else {
        cb(new snmp.RequestTimedOutError('Request timed out'), undefined as unknown as snmp.Varbind[]);
      }
    },
    subtree: () => {},
    walk: () => {},
    close: () => {},
  } as unknown as snmp.Session;
}

function cred(id: string): SnmpCredential {
  return { id, version: 'v2c', community: `community-${id}` };
}

describe('SnmpClient — negociación de credenciales', () => {
  test('credencial #1 sirve → 1 sola sesión creada, activeCredentialId correcto', async () => {
    let created = 0;
    const factory = () => { created++; return fakeSession('ok'); };
    const client = new SnmpClient('10.0.0.1', [cred('a'), cred('b')], null, factory);
    const v = await client.get('1.3.6.1.2.1.1.1.0');
    assert.equal(created, 1);
    assert.equal(client.activeCredentialId, 'a');
    assert.notEqual(v, null);
  });

  test('fail-fast: sin evidencia de vida, un host muerto corta en la credencial #1 (no prueba el resto)', async () => {
    let created = 0;
    const factory = () => { created++; return fakeSession('timeout'); };
    const client = new SnmpClient('10.0.0.2', [cred('a'), cred('b'), cred('c')], null, factory);
    // NO se llama markHostAlive().
    const v = await client.get('1.3.6.1.2.1.1.1.0');
    assert.equal(v, null);
    assert.equal(created, 1, 'no debe crear sesiones para las credenciales #2/#3 sin evidencia de vida');
    assert.equal(client.unreachable, true);
  });

  test('con evidencia de vida, prueba la lista completa antes de rendirse', async () => {
    let created = 0;
    const factory = () => { created++; return fakeSession('timeout'); };
    const client = new SnmpClient('10.0.0.3', [cred('a'), cred('b'), cred('c')], null, factory);
    client.markHostAlive();
    const v = await client.get('1.3.6.1.2.1.1.1.0');
    assert.equal(v, null);
    assert.equal(created, 3, 'con evidencia de vida debe agotar toda la lista');
    assert.equal(client.unreachable, true);
  });

  test('auth-rejected avanza a la siguiente SIN necesitar evidencia de vida (el host respondió)', async () => {
    let call = 0;
    const factory = () => {
      call++;
      return call === 1 ? fakeSession('auth-rejected') : fakeSession('ok');
    };
    const client = new SnmpClient('10.0.0.4', [cred('bad'), cred('good')], null, factory);
    // Sin markHostAlive(): un rechazo de autenticación por sí solo prueba que
    // el host está vivo, no depende del flag externo.
    const v = await client.get('1.3.6.1.2.1.1.1.0');
    assert.notEqual(v, null);
    assert.equal(client.activeCredentialId, 'good');
    assert.equal(call, 2);
  });

  test('preferredCredentialId se prueba primero, sin importar su posición en la lista', async () => {
    const tried: string[] = [];
    const factory = (_ip: string, c: SnmpCredential) => { tried.push(c.id); return fakeSession(c.id === 'c' ? 'ok' : 'timeout'); };
    const client = new SnmpClient('10.0.0.5', [cred('a'), cred('b'), cred('c')], 'c', factory);
    client.markHostAlive();
    await client.get('1.3.6.1.2.1.1.1.0');
    assert.equal(tried[0], 'c', 'la credencial preferida debe probarse primero');
  });

  test('memoización: varios get() concurrentes disparan UNA sola negociación', async () => {
    let created = 0;
    const factory = () => { created++; return fakeSession('ok'); };
    const client = new SnmpClient('10.0.0.6', [cred('a')], null, factory);
    await Promise.all([
      client.get('1.3.6.1.2.1.1.1.0'),
      client.get('1.3.6.1.2.1.1.5.0'),
      client.getMany(['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']),
    ]);
    assert.equal(created, 1, 'sesiones concurrentes no deben disparar negociaciones redundantes');
  });

  test('lista vacía de credenciales → unreachable inmediato, sin crear ninguna sesión', async () => {
    let created = 0;
    const factory = () => { created++; return fakeSession('ok'); };
    const client = new SnmpClient('10.0.0.7', [], null, factory);
    const v = await client.get('1.3.6.1.2.1.1.1.0');
    assert.equal(v, null);
    assert.equal(created, 0);
    assert.equal(client.unreachable, true);
  });
});
