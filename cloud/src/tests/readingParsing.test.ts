// parseRawIdentity — lógica pura, sin servidor, sin base.
// Ejecutar: npx tsx --test src/tests/readingParsing.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRawIdentity } from '../modules/agents/domain/services/reading-parsing';
import type { IncomingReading } from '../modules/agents/domain/entities/agent';

const NUL = String.fromCharCode(0);

describe('parseRawIdentity — sanea bytes NUL del serial reportado', () => {
  test('serial con NUL embebido (visto en producción, ISSN 12-13/09/2026) → NUL removido', () => {
    const r = { device_id: `SN12345${NUL}`, ip: '10.3.7.50' } as IncomingReading;
    const { serialToUse } = parseRawIdentity(r);
    assert.equal(serialToUse, 'SN12345');
    assert.ok(!serialToUse!.includes(NUL));
  });

  test('serial que queda vacío tras sanear (sólo NUL) → null, no string vacío', () => {
    const r = { device_id: `${NUL}${NUL}`, ip: '10.3.7.50' } as IncomingReading;
    const { serialToUse } = parseRawIdentity(r);
    assert.equal(serialToUse, null);
  });

  test('serial normal, sin NUL → sin cambios', () => {
    const r = { device_id: 'ABC123XYZ', ip: '10.3.7.50' } as IncomingReading;
    const { serialToUse } = parseRawIdentity(r);
    assert.equal(serialToUse, 'ABC123XYZ');
  });

  test('device_id con forma de IP sigue tratándose como "sin serial real"', () => {
    const r = { device_id: '10.3.7.50', ip: '10.3.7.50' } as IncomingReading;
    const { serialToUse } = parseRawIdentity(r);
    assert.equal(serialToUse, null);
  });
});
