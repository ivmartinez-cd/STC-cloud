// materializeRange() — tope de seguridad al consumir ipRange() (defensa en
// profundidad, independiente de la validación cloud de ip_ranges).
// Ejecutar: npx tsx --test src/tests/networkUtils.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ipRange, materializeRange } from '../core/NetworkUtils';

describe('NetworkUtils — materializeRange', () => {
  test('rango bajo el tope: devuelve todas las IPs, truncated=false', () => {
    const { ips, truncated } = materializeRange({ start: '10.0.0.1', end: '10.0.0.5' }, 100);
    assert.deepEqual(ips, ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5']);
    assert.equal(truncated, false);
  });

  test('rango que excede el tope: se corta exactamente en el tope, truncated=true', () => {
    const { ips, truncated } = materializeRange({ start: '10.0.0.1', end: '10.0.0.10' }, 3);
    assert.deepEqual(ips, ['10.0.0.1', '10.0.0.2', '10.0.0.3']);
    assert.equal(truncated, true);
  });

  test('rango que coincide EXACTAMENTE con el tope: truncated=false (no es un falso positivo por coincidencia de límites)', () => {
    const { ips, truncated } = materializeRange({ start: '10.0.0.1', end: '10.0.0.5' }, 5);
    assert.equal(ips.length, 5);
    assert.equal(truncated, false);
  });

  test('cap=0: no materializa nada, truncated=true si el rango no está vacío', () => {
    const { ips, truncated } = materializeRange({ start: '10.0.0.1', end: '10.0.0.5' }, 0);
    assert.deepEqual(ips, []);
    assert.equal(truncated, true);
  });

  test('rango de una sola IP bajo el tope: sin truncar', () => {
    const { ips, truncated } = materializeRange({ start: '10.0.0.1', end: '10.0.0.1' }, 10);
    assert.deepEqual(ips, ['10.0.0.1']);
    assert.equal(truncated, false);
  });

  test('sigue usando ipRange() por debajo — mismo comportamiento que antes para rangos normales', () => {
    const direct = [...ipRange('192.168.1.1', '192.168.1.3')];
    const { ips, truncated } = materializeRange({ start: '192.168.1.1', end: '192.168.1.3' }, 10);
    assert.deepEqual(ips, direct);
    assert.equal(truncated, false);
  });
});
