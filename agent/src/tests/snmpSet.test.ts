// SnmpClient.setInt (agente v1.2.0 — reinicio remoto de impresora) —
// unitario con sesiones falsas inyectadas por el seam del constructor,
// mismo criterio que snmpNegotiate.test.ts.
// Ejecutar: npx tsx --test src/tests/snmpSet.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import snmp from 'net-snmp';
import { SnmpClient, type SnmpCredential } from '../capture/transport/snmp';

function cred(id: string): SnmpCredential {
  return { id, version: 'v2c', community: `community-${id}` };
}

/** Sesión falsa que responde OK al GET de negociación (PROBE_OID) y deja el
 *  comportamiento de `.set()` a cargo del test. */
function fakeSession(setImpl: snmp.Session['set']): snmp.Session {
  return {
    get: (oids: string[], cb: (err: Error | null, varbinds: snmp.Varbind[]) => void) => {
      cb(null, [{ oid: oids[0], type: 2, value: 1 }]);
    },
    subtree: () => {},
    walk: () => {},
    set: setImpl,
    close: () => {},
  } as unknown as snmp.Session;
}

const OID = '1.3.6.1.2.1.43.5.1.1.3.1';

describe('SnmpClient.setInt — clasificación de resultado', () => {
  test('el device acepta el SET → ok:true', async () => {
    const session = fakeSession((varbinds, cb) => cb(null, varbinds as unknown as snmp.Varbind[]));
    const client = new SnmpClient('10.0.0.1', [cred('a')], null, () => session);
    const out = await client.setInt(OID, 2);
    assert.deepEqual(out, { ok: true });
  });

  test('timeout (sin respuesta) → no-response', async () => {
    const session = fakeSession((_v, cb) => cb(new snmp.RequestTimedOutError('Request timed out'), undefined as unknown as snmp.Varbind[]));
    const client = new SnmpClient('10.0.0.2', [cred('a')], null, () => session);
    const out = await client.setInt(OID, 2);
    assert.equal(out.ok, false);
    assert.equal(!out.ok && out.reason, 'no-response');
  });

  // node:test no trae test.each — los 4 códigos de "sin permiso de escritura" se recorren a mano.
  for (const [name, status] of [['ReadOnly', 4], ['NoAccess', 6], ['AuthorizationError', 16], ['NotWritable', 17]] as const) {
    test(`error de protocolo ${name} (status=${status}) → no-write-permission`, async () => {
      const err = new snmp.RequestFailedError(name, status);
      const session = fakeSession((_v, cb) => cb(err, undefined as unknown as snmp.Varbind[]));
      const client = new SnmpClient('10.0.0.3', [cred('a')], null, () => session);
      const out = await client.setInt(OID, 2);
      assert.equal(out.ok, false);
      assert.equal(!out.ok && out.reason, 'no-write-permission');
      assert.equal(!out.ok && out.detail, name);
    });
  }

  test('otro error de protocolo (BadValue) → device-error, no se confunde con falta de permiso', async () => {
    const err = new snmp.RequestFailedError('BadValue', 3);
    const session = fakeSession((_v, cb) => cb(err, undefined as unknown as snmp.Varbind[]));
    const client = new SnmpClient('10.0.0.4', [cred('a')], null, () => session);
    const out = await client.setInt(OID, 2);
    assert.equal(out.ok, false);
    assert.equal(!out.ok && out.reason, 'device-error');
  });

  test('sin credenciales negociadas (host inalcanzable) → no-response sin intentar el set', async () => {
    let setCalled = false;
    const session = fakeSession((_v, cb) => { setCalled = true; cb(null, []); });
    // ninguna credencial → ensureSession() nunca abre sesión real
    const client = new SnmpClient('10.0.0.5', [], null, () => session);
    const out = await client.setInt(OID, 2);
    assert.equal(out.ok, false);
    assert.equal(setCalled, false);
  });
});
