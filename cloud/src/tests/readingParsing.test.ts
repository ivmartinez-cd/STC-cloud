// parseRawIdentity — lógica pura, sin servidor, sin base.
// Ejecutar: npx tsx --test src/tests/readingParsing.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectCounterResets, parseRawIdentity } from '../modules/agents/domain/services/reading-parsing';
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

describe('detectCounterResets — sólo compara lecturas del mismo método de captura', () => {
  const dev = (over: Record<string, unknown> = {}) =>
    ({ total_pages: 223743, mono_pages: 223743, color_pages: 0, poll_method: 'snmp', ...over });

  test('baja real con el MISMO método → reset', () => {
    const { counterResets, resetValue } = detectCounterResets(dev(), 165182, 165182, 0, 'snmp');
    assert.equal(counterResets.length, 2);
    assert.equal(resetValue, 165182);
  });

  test('baja al cambiar de método (snmp→pjl) NO es reset: es otro medidor', () => {
    // El caso real de 0ACTBJFJB00015V: SNMP da 223743, PJL da 165182.
    const { counterResets, resetValue } = detectCounterResets(dev(), 165182, null, null, 'pjl');
    assert.deepEqual(counterResets, []);
    assert.equal(resetValue, null);
  });

  test('baja al cambiar ews→snmp tampoco (M5370LX: 1889 ews vs 1897 snmp)', () => {
    const { counterResets } = detectCounterResets(dev({ total_pages: 1897, mono_pages: 1897, poll_method: 'snmp' }), 1889, 1889, 0, 'ews');
    assert.deepEqual(counterResets, []);
  });

  test('suba con cambio de método sigue sin ser reset (no aplica de todos modos)', () => {
    const { counterResets } = detectCounterResets(dev({ total_pages: 165182, poll_method: 'pjl' }), 223743, 223743, 0, 'snmp');
    assert.deepEqual(counterResets, []);
  });

  test('sin método guardado (primera vez) se compara igual — no se pierde un reset legítimo', () => {
    const { counterResets } = detectCounterResets(dev({ poll_method: null }), 100, 100, 0, 'snmp');
    assert.equal(counterResets.length, 2);
  });

  test('sin método entrante cae al comportamiento previo (compara)', () => {
    const { counterResets } = detectCounterResets(dev(), 100, 100, 0);
    assert.equal(counterResets.length, 2);
  });
});
