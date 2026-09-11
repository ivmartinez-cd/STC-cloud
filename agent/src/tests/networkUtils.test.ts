// Helpers de red del agente: enumeración de rangos, point lookup por hostname
// y clasificación de IPs privadas/reservadas.
// Ejecutar: npx tsx --test src/tests/networkUtils.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ipRange, resolveHostname, isPrivateOrReservedIp } from '../core/NetworkUtils';

describe('NetworkUtils — ipRange', () => {
  test('enumera de start a end inclusive', () => {
    assert.deepEqual([...ipRange('192.168.1.1', '192.168.1.3')], ['192.168.1.1', '192.168.1.2', '192.168.1.3']);
  });

  test('cruza el borde de octeto sin saltear ni repetir', () => {
    assert.deepEqual([...ipRange('10.0.0.254', '10.0.1.1')], ['10.0.0.254', '10.0.0.255', '10.0.1.0', '10.0.1.1']);
  });

  test('start > end no enumera nada (dato corrupto, no un rango que da la vuelta)', () => {
    assert.deepEqual([...ipRange('10.0.0.5', '10.0.0.1')], []);
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
