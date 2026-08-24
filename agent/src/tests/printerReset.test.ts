// restartPrinter() — agente v1.2.0. Puro: puerto SnmpClient inyectado, sin
// red real. Ejecutar: npx tsx --test src/tests/printerReset.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRT_GENERAL_RESET_OID,
  PRT_RESET_POWER_CYCLE,
  restartPrinter,
  type PrinterResetter,
} from '../snmp/printerReset';
import type { SetOutcome } from '../capture/transport/snmp';

function fakeResetter(outcome: SetOutcome, calls: { oid?: string; value?: number }[] = []): PrinterResetter {
  return {
    async setInt(oid: string, value: number) {
      calls.push({ oid, value });
      return outcome;
    },
  };
}

describe('restartPrinter', () => {
  test('éxito → ok:true, usa el OID estándar de prtGeneralReset con powerCycleReset(2)', async () => {
    const calls: { oid?: string; value?: number }[] = [];
    const out = await restartPrinter(fakeResetter({ ok: true }, calls));
    assert.deepEqual(out, { ok: true });
    assert.deepEqual(calls, [{ oid: PRT_GENERAL_RESET_OID, value: PRT_RESET_POWER_CYCLE }]);
  });

  test('sin permiso de escritura → propaga el motivo tal cual (para el mensaje al operador)', async () => {
    const out = await restartPrinter(fakeResetter({ ok: false, reason: 'no-write-permission', detail: 'NotWritable' }));
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no-write-permission');
    assert.equal(out.detail, 'NotWritable');
  });

  test('sin respuesta del equipo → no-response', async () => {
    const out = await restartPrinter(fakeResetter({ ok: false, reason: 'no-response' }));
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no-response');
  });
});
