// credentialsForRange() — filtro de credenciales por rango (§2.3 gap
// analysis: "credenciales SNMP por rango"). Ejecutar:
// npx tsx --test src/tests/scanServiceCredentials.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { credentialsForRange } from '../core/ScanService';
import type { SnmpCredential } from '../capture/transport/snmp';

const POOL: SnmpCredential[] = [
  { id: 'a', version: 'v2c', community: 'public' },
  { id: 'b', version: 'v2c', community: 'private' },
  { id: 'c', version: 'v2c', community: 'corp' },
];

describe('ScanService — credentialsForRange', () => {
  test('sin credentialIds (undefined) → devuelve el pool completo, mismo orden', () => {
    assert.deepEqual(credentialsForRange(POOL, undefined), POOL);
  });

  test('credentialIds vacío → devuelve el pool completo (mismo criterio que undefined)', () => {
    assert.deepEqual(credentialsForRange(POOL, []), POOL);
  });

  test('filtra al subset, preservando el ORDEN del pool (no el orden de credentialIds)', () => {
    // Pedido en orden c,a — el resultado debe respetar el orden del pool: a,c
    const out = credentialsForRange(POOL, ['c', 'a']);
    assert.deepEqual(out.map(c => c.id), ['a', 'c']);
  });

  test('un solo id → subset de 1', () => {
    const out = credentialsForRange(POOL, ['b']);
    assert.deepEqual(out.map(c => c.id), ['b']);
  });

  test('ids que ya no existen en el pool (el cloud ya resolvió esto antes de mandarlo, pero por las dudas) → subset vacío, no el pool completo', () => {
    // El fail-open real pasa del lado cloud (agentService.getConfig()) antes
    // de que esto llegue al agente — acá sólo se testea el filtro puro, que
    // debe comportarse como un filtro honesto (no reinventa el fail-open).
    assert.deepEqual(credentialsForRange(POOL, ['no-existe']), []);
  });

  test('pool vacío siempre devuelve vacío, con o sin credentialIds', () => {
    assert.deepEqual(credentialsForRange([], undefined), []);
    assert.deepEqual(credentialsForRange([], ['a']), []);
  });
});
