// Lógica pura de rangos IP (CIDR + tope + exclusiones) — sin servidor, sin
// base. Ejecutar: npx tsx --test src/tests/ipRangeSpec.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateIpRangeSpecs, compileIpRangeSpecs, publicIpWarnings,
  IpRangeValidationError, type IpRangeSpecInput,
} from '../services/ipRangeSpec';

describe('ipRangeSpec — validateIpRangeSpecs', () => {
  test('rango manual válido', () => {
    const out = validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10' }]);
    assert.deepEqual(out, [{ label: null, start: '10.0.0.1', end: '10.0.0.10' }]);
  });

  test('CIDR válido', () => {
    const out = validateIpRangeSpecs([{ cidr: '10.0.1.0/24', label: 'Piso 3' }]);
    assert.deepEqual(out, [{ label: 'Piso 3', cidr: '10.0.1.0/24' }]);
  });

  test('ni cidr ni start/end → error', () => {
    assert.throws(() => validateIpRangeSpecs([{}]), IpRangeValidationError);
  });

  test('cidr Y start/end a la vez → error (mutuamente excluyentes)', () => {
    assert.throws(
      () => validateIpRangeSpecs([{ cidr: '10.0.0.0/24', start: '10.0.0.1', end: '10.0.0.2' }]),
      IpRangeValidationError
    );
  });

  test('start sin end → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.1' }]), IpRangeValidationError);
  });

  test('IP de start inválida → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '999.0.0.1', end: '10.0.0.10' }]), IpRangeValidationError);
  });

  test('CIDR con prefijo inválido → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ cidr: '10.0.0.0/33' }]), IpRangeValidationError);
  });

  test('start > end → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.10', end: '10.0.0.1' }]), IpRangeValidationError);
  });

  test('más de 20 specs → error', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ start: `10.0.${i}.1`, end: `10.0.${i}.2` }));
    assert.throws(() => validateIpRangeSpecs(many), IpRangeValidationError);
  });

  test('un solo spec que supera el tope de 2000 IPs declaradas → error', () => {
    assert.throws(() => validateIpRangeSpecs([{ cidr: '10.0.0.0/20' }]), IpRangeValidationError); // /20 = 4096
  });

  test('varios specs chicos que SUMAN más de 2000 → error en el que hace overflow', () => {
    const specs = [
      { start: '10.0.0.0', end: '10.0.7.255' },  // 2048 IPs
      { start: '10.1.0.0', end: '10.1.0.10' },   // 11 IPs más — dispara el overflow
    ];
    assert.throws(() => validateIpRangeSpecs(specs), IpRangeValidationError);
  });

  test('exactamente 2000 IPs declaradas → no lanza (el límite es inclusivo)', () => {
    // 10.0.0.0 - 10.0.7.207 = 2000 IPs exactas (7*256 + 207 + 1 = 2000)
    assert.doesNotThrow(() => validateIpRangeSpecs([{ start: '10.0.0.0', end: '10.0.7.207' }]));
  });

  test('exclude con IP inválida → error', () => {
    assert.throws(
      () => validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['no-es-una-ip'] }]),
      IpRangeValidationError
    );
  });

  test('exclude válido se conserva', () => {
    const out = validateIpRangeSpecs([{ start: '10.0.0.1', end: '10.0.0.10', exclude: ['10.0.0.5'] }]);
    assert.deepEqual(out[0].exclude, ['10.0.0.5']);
  });

  test('más de 32 exclusiones → error', () => {
    const exclude = Array.from({ length: 33 }, (_, i) => `10.0.0.${i + 1}`);
    assert.throws(() => validateIpRangeSpecs([{ start: '10.0.0.0', end: '10.0.0.254', exclude }]), IpRangeValidationError);
  });

  test('no es un array → error', () => {
    assert.throws(() => validateIpRangeSpecs({} as unknown), IpRangeValidationError);
  });
});

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
});

describe('ipRangeSpec — publicIpWarnings', () => {
  test('rango totalmente privado (RFC1918) no genera warning', () => {
    assert.deepEqual(publicIpWarnings([{ start: '10.0.0.1', end: '10.0.0.10' }]), []);
    assert.deepEqual(publicIpWarnings([{ cidr: '192.168.1.0/24' }]), []);
  });

  test('rango con IP pública genera warning', () => {
    const warnings = publicIpWarnings([{ label: 'Oficina', start: '8.8.8.0', end: '8.8.8.10' }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Oficina/);
    assert.match(warnings[0], /pública/);
  });

  test('loopback y link-local no generan warning', () => {
    assert.deepEqual(publicIpWarnings([{ start: '127.0.0.1', end: '127.0.0.10' }]), []);
    assert.deepEqual(publicIpWarnings([{ start: '169.254.1.1', end: '169.254.1.10' }]), []);
  });

  test('nunca lanza — es sólo informativo, nunca bloquea el guardado', () => {
    assert.doesNotThrow(() => publicIpWarnings([{ cidr: 'basura' } as IpRangeSpecInput]));
  });
});
