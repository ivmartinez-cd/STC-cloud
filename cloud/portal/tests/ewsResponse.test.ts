// Decodificación de la respuesta del proxy EWS remoto y normalización de la
// ruta que se le pide al agente. Lógica pura, sin React, sin DOM, sin red.
// Ejecutar desde la raíz del repo:
//   npx tsx --test cloud/portal/tests/ewsResponse.test.ts
//
// Lo que se cubre es justamente lo que el navegador NO puede decidir solo: el
// cuerpo llega en Base64 (el agente nunca lo pasa a texto, corrompía binarios),
// así que "esto es HTML / esto es una imagen / esto está en iso-8859-1" se
// decide acá, con lo que haya declarado un firmware de impresora — que a veces
// no declara nada.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyKind, charsetOf, contentTypeOf, decodeBase64, decodeText, downloadNameFor,
  formatBytes, sandboxedSrcDoc, statusTone,
} from '../src/features/devices/lib/ewsResponse';
import { normalizeEwsPath, presetsFor } from '../src/features/devices/lib/ewsPaths';

const b64 = (s: string) => Buffer.from(s, 'binary').toString('base64');
const bytesOf = (s: string) => decodeBase64(b64(s));

describe('contentTypeOf / charsetOf', () => {
  test('ignora los parámetros y la capitalización del header', () => {
    assert.equal(contentTypeOf({ 'Content-Type': 'TEXT/HTML; charset=ISO-8859-1' }), 'text/html');
  });
  test('sin header devuelve cadena vacía, no undefined', () => {
    assert.equal(contentTypeOf(undefined), '');
    assert.equal(contentTypeOf({ server: 'HP HTTP Server' }), '');
  });
  test('el charset declarado gana; sin declarar, utf-8', () => {
    assert.equal(charsetOf({ 'content-type': 'text/html; charset=iso-8859-1' }), 'iso-8859-1');
    assert.equal(charsetOf({ 'content-type': 'text/html' }), 'utf-8');
  });
});

describe('decodeText', () => {
  test('respeta el charset del equipo: latin-1 no se lee como utf-8', () => {
    // 0xD3 = "Ó" en iso-8859-1; como utf-8 sería un byte inválido.
    const bytes = new Uint8Array([0x4f, 0x46, 0x49, 0x43, 0x49, 0x4e, 0x41, 0x20, 0xd3]);
    assert.equal(decodeText(bytes, 'iso-8859-1'), 'OFICINA Ó');
  });
  test('un charset que el navegador no conoce cae a utf-8 en vez de tirar', () => {
    assert.equal(decodeText(bytesOf('hola'), 'ansi_x3.110-1983-inventado'), 'hola');
  });
});

describe('bodyKind', () => {
  const empty = new Uint8Array(0);
  test('clasifica por content-type declarado', () => {
    assert.equal(bodyKind('text/html', empty), 'html');
    assert.equal(bodyKind('application/xhtml+xml', empty), 'html');
    assert.equal(bodyKind('application/json', empty), 'text');
    assert.equal(bodyKind('text/xml', empty), 'text');
    assert.equal(bodyKind('application/vnd.hp-PCL+xml', empty), 'text');
    assert.equal(bodyKind('image/png', empty), 'image');
    assert.equal(bodyKind('image/svg+xml', empty), 'image');
    assert.equal(bodyKind('application/pdf', empty), 'binary');
  });
  test('sin content-type: olfatea HTML por el marcado inicial', () => {
    assert.equal(bodyKind('', bytesOf('  <!DOCTYPE HTML><html><body>x')), 'html');
    assert.equal(bodyKind('', bytesOf('<html lang="es">')), 'html');
  });
  test('sin content-type: bytes imprimibles son texto, bytes de control son binario', () => {
    assert.equal(bodyKind('', bytesOf('{"total":1234}\n')), 'text');
    assert.equal(bodyKind('', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a])), 'binary');
  });
});

describe('sandboxedSrcDoc', () => {
  test('la CSP y el base van ANTES del documento del equipo', () => {
    const out = sandboxedSrcDoc('<html><head><title>Impresora</title></head><body>x</body></html>');
    assert.ok(out.indexOf('Content-Security-Policy') < out.indexOf('<html>'), 'la CSP tiene que quedar primera para aplicar');
    assert.ok(out.includes("default-src 'none'"), 'sin default-src none la página saldría a buscar sus recursos contra el origen del portal');
    assert.ok(out.includes('<base href="about:blank">'));
    assert.ok(out.endsWith('<body>x</body></html>'), 'el documento del equipo se deja intacto');
  });
});

describe('normalizeEwsPath', () => {
  test('acepta lo que el operador tenga a mano', () => {
    assert.equal(normalizeEwsPath('/sws/app/information/home/home.json'), '/sws/app/information/home/home.json');
    assert.equal(normalizeEwsPath('DevMgmt/ProductConfigDyn.xml'), '/DevMgmt/ProductConfigDyn.xml');
    assert.equal(normalizeEwsPath('  /status  '), '/status');
    assert.equal(normalizeEwsPath(''), '/');
  });
  test('descarta el origen de una URL pegada del navegador (la IP la pone el backend)', () => {
    assert.equal(normalizeEwsPath('http://10.20.0.31/hp/device/info_suppliesStatus.html'), '/hp/device/info_suppliesStatus.html');
    assert.equal(normalizeEwsPath('https://10.20.0.31:443/x?y=1'), '/x?y=1');
  });
  test('saca los CR/LF que el backend rechaza con 400', () => {
    assert.equal(normalizeEwsPath('/x\r\nHost: otro'), '/xHost: otro');
  });
});

describe('presetsFor', () => {
  test('la home siempre está, y las rutas de la marca sólo si se reconoce', () => {
    assert.deepEqual(presetsFor(null).map((p) => p.path), ['/']);
    assert.deepEqual(presetsFor('Epson').map((p) => p.path), ['/']);
    assert.ok(presetsFor('HP').some((p) => p.path === '/DevMgmt/ProductConfigDyn.xml'));
    assert.ok(presetsFor('samsung').some((p) => p.path === '/sws/app/information/counters/counters.json'));
    assert.ok(presetsFor('LEXMARK').some((p) => p.path.startsWith('/cgi-bin/dynamic/')));
  });
});

describe('helpers de presentación', () => {
  test('statusTone separa 2xx/3xx/4xx/5xx', () => {
    assert.equal(statusTone(200), 'ok');
    assert.equal(statusTone(302), 'redirect');
    assert.equal(statusTone(404), 'client');
    assert.equal(statusTone(503), 'server');
  });
  test('formatBytes', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2.0 kB');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
  });
  test('downloadNameFor usa el último segmento con extensión', () => {
    assert.equal(downloadNameFor('/reports/config.pdf'), 'config.pdf');
    assert.equal(downloadNameFor('/cgi-bin/dynamic/topbar.html?x=1'), 'topbar.html');
    assert.equal(downloadNameFor('/'), 'ews.bin');
  });
});
