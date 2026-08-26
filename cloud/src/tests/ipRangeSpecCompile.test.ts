// Lógica pura de compilación de rangos IP (CIDR + tope + exclusiones) — sin
// servidor, sin base. Separado de ipRangeSpec.test.ts (deuda de sizes-baseline,
// 2026-08-26) sólo por tamaño de archivo; misma suite lógica.
// Ejecutar: npx tsx --test src/tests/ipRangeSpecCompile.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compileIpRangeSpecs, type IpRangeSpecInput } from '../shared/domain/ip-range-spec';

describe('ipRangeSpec — compileIpRangeSpecs', () => {
  test('rango manual se compila tal cual (sin exclusiones)', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.5' }]);
    assert.deepEqual(out, [{ start: '10.0.0.1', end: '10.0.0.5' }]);
  });

  test('CIDR /24 se expande a start/end y auto-excluye network/broadcast', () => {
    const out = compileIpRangeSpecs([{ cidr: '10.0.1.0/24' }]);
    assert.deepEqual(out, [{ start: '10.0.1.1', end: '10.0.1.254' }]);
  });

  test('IP de host en el CIDR se normaliza a la IP de red', () => {
    const out = compileIpRangeSpecs([{ cidr: '10.0.1.5/24' }]);
    assert.deepEqual(out, [{ start: '10.0.1.1', end: '10.0.1.254' }]);
  });

  test('/31 y /32 NO auto-excluyen nada (sin direcciones reservadas, RFC 3021)', () => {
    const out31 = compileIpRangeSpecs([{ cidr: '10.0.1.0/31' }]);
    assert.deepEqual(out31, [{ start: '10.0.1.0', end: '10.0.1.1' }]);

    const out32 = compileIpRangeSpecs([{ cidr: '10.0.1.5/32' }]);
    assert.deepEqual(out32, [{ start: '10.0.1.5', end: '10.0.1.5' }]);
  });

  test('start/end manual NO auto-excluye network/broadcast (el admin puso esos límites a propósito)', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.1.0', end: '10.0.1.255' }]);
    assert.deepEqual(out, [{ start: '10.0.1.0', end: '10.0.1.255' }]);
  });

  test('excluir una IP en el medio parte el rango en dos', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.5'] }]);
    assert.deepEqual(out, [{ start: '10.0.0.1', end: '10.0.0.4' }, { start: '10.0.0.6', end: '10.0.0.10' }]);
  });

  test('excluir el primer IP no genera un fragmento inválido', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.1'] }]);
    assert.deepEqual(out, [{ start: '10.0.0.2', end: '10.0.0.10' }]);
  });

  test('excluir el último IP no genera un fragmento inválido', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.10'] }]);
    assert.deepEqual(out, [{ start: '10.0.0.1', end: '10.0.0.9' }]);
  });

  test('excluir TODO el rango devuelve cero pares (nunca start>end)', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.1', exclude: ['10.0.0.1'] }]);
    assert.deepEqual(out, []);
  });

  test('excludes duplicados no rompen nada', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.5', '10.0.0.5'] }]);
    assert.deepEqual(out, [{ start: '10.0.0.1', end: '10.0.0.4' }, { start: '10.0.0.6', end: '10.0.0.10' }]);
  });

  test('exclude fuera del propio rango del spec es un no-op silencioso', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.99.99'] }]);
    assert.deepEqual(out, [{ start: '10.0.0.1', end: '10.0.0.10' }]);
  });

  test('múltiples specs se concatenan en orden', () => {
    const out = compileIpRangeSpecs([
      { start: '10.0.0.1', end: '10.0.0.2' },
      { cidr: '10.0.2.0/30' },
    ]);
    assert.deepEqual(out, [
      { start: '10.0.0.1', end: '10.0.0.2' },
      { start: '10.0.2.1', end: '10.0.2.2' }, // /30 = 4 IPs, auto-excluye .0 y .3
    ]);
  });

  test('un spec corrupto se salta sin tirar abajo el resto (tolerancia estilo toWire)', () => {
    const specs = [
      { start: '10.0.0.1', end: '10.0.0.2' },
      { cidr: 'no-es-un-cidr' } as IpRangeSpecInput,
      { start: '10.0.1.1', end: '10.0.1.2' },
    ];
    const out = compileIpRangeSpecs(specs);
    assert.deepEqual(out, [
      { start: '10.0.0.1', end: '10.0.0.2' },
      { start: '10.0.1.1', end: '10.0.1.2' },
    ]);
  });

  test('lista vacía compila a lista vacía', () => {
    assert.deepEqual(compileIpRangeSpecs([]), []);
  });

  test('aritmética segura: rango que cruza 127.255.255.255 → 128.0.0.0 no cuenta 0 IPs en silencio', () => {
    // Regresión directa del hallazgo del Plan-agent: ipRange()/toN() del lado
    // agente usa bitwise con signo y desborda en este borde exacto — el
    // compilador cloud usa multiplicación, no debe repetir el bug.
    const out = compileIpRangeSpecs([{ start: '127.255.255.254', end: '128.0.0.1' }]);
    assert.deepEqual(out, [{ start: '127.255.255.254', end: '128.0.0.1' }]);
  });

  test('un spec de hostname se salta (no compila a un par, tampoco loguea error)', () => {
    const specs: IpRangeSpecInput[] = [
      { start: '10.0.0.1', end: '10.0.0.2' },
      { hostname: 'algo.local' },
      { start: '10.0.1.1', end: '10.0.1.2' },
    ];
    assert.deepEqual(compileIpRangeSpecs(specs), [
      { start: '10.0.0.1', end: '10.0.0.2' },
      { start: '10.0.1.1', end: '10.0.1.2' },
    ]);
  });

  test('credential_ids se propaga a cada sub-rango compilado (incluso partido por exclusiones)', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.5'], credential_ids: ['cred-a'] }]);
    assert.deepEqual(out, [
      { start: '10.0.0.1', end: '10.0.0.4', credential_ids: ['cred-a'] },
      { start: '10.0.0.6', end: '10.0.0.10', credential_ids: ['cred-a'] },
    ]);
  });

  test('sin credential_ids, el compilado no tiene el campo', () => {
    const out = compileIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.2' }]);
    assert.equal(out[0].credential_ids, undefined);
  });
});
