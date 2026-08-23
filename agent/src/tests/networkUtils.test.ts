// materializeRange() — tope de seguridad al consumir ipRange() (defensa en
// profundidad, independiente de la validación cloud de ip_ranges).
// Ejecutar: npx tsx --test src/tests/networkUtils.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ipRange, materializeRange, resolveHostname, isPrivateOrReservedIp } from '../core/NetworkUtils';

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

describe('NetworkUtils — resolveHostname (point lookup, con lookupFn fake)', () => {
  test('resuelve correctamente cuando el lookup responde a tiempo', async () => {
    const fakeLookup = (h: string, _opts: unknown, cb: (err: NodeJS.ErrnoException | null, address: string) => void) => {
      cb(null, '10.0.0.42');
    };
    const ip = await resolveHostname('printer1.local', 1000, fakeLookup);
    assert.equal(ip, '10.0.0.42');
  });

  test('NXDOMAIN (error real) → null, no lanza', async () => {
    const fakeLookup = (h: string, _opts: unknown, cb: (err: NodeJS.ErrnoException | null, address: string) => void) => {
      cb(new Error('ENOTFOUND') as NodeJS.ErrnoException, '');
    };
    const ip = await resolveHostname('no-existe.local', 1000, fakeLookup);
    assert.equal(ip, null);
  });

  test('timeout: el lookup nunca llama al callback (DNS caído) → null antes del timeout configurado, no cuelga el test', async () => {
    const fakeLookup = () => { /* nunca llama a cb — simula un DNS colgado */ };
    const start = Date.now();
    const ip = await resolveHostname('colgado.local', 50, fakeLookup);
    assert.equal(ip, null);
    assert.ok(Date.now() - start < 500, 'debe resolver por el timeout, no colgarse');
  });

  test('lookupFn que tira una excepción sincrónica → null, no propaga', async () => {
    const fakeLookup = () => { throw new Error('boom'); };
    const ip = await resolveHostname('algo.local', 1000, fakeLookup);
    assert.equal(ip, null);
  });
});

describe('NetworkUtils — isPrivateOrReservedIp', () => {
  test('RFC1918 (10/8, 172.16/12, 192.168/16) → true', () => {
    assert.equal(isPrivateOrReservedIp('10.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('172.16.0.1'), true);
    assert.equal(isPrivateOrReservedIp('172.31.255.255'), true);
    assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
  });

  test('loopback y link-local → true', () => {
    assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('169.254.1.1'), true);
  });

  test('IP pública → false', () => {
    assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
  });

  test('172.15.x.x y 172.32.x.x están FUERA del bloque privado 172.16/12 (borde correcto)', () => {
    assert.equal(isPrivateOrReservedIp('172.15.255.255'), false);
    assert.equal(isPrivateOrReservedIp('172.32.0.0'), false);
  });
});
