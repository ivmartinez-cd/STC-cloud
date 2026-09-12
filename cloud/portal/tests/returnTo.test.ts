// Validación del `?from=` con el que una ficha vuelve a su pantalla de origen.
// Lógica pura, sin React, sin DOM, sin red. Ejecutar desde la raíz del repo:
//   npx tsx --test cloud/portal/tests/returnTo.test.ts
//
// El valor sale de la URL, o sea del usuario: si se aceptara cualquier cosa, el
// breadcrumb sería un open redirect servido desde nuestro propio dominio. Los
// casos de "rechaza" de acá abajo son justamente esos vectores.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnTo, returnToLabel, returnParamFor } from '../src/shared/lib/returnTo';

describe('safeReturnTo acepta paths internos conocidos', () => {
  const validos = [
    '/clients',
    '/clients?segment=con_alertas&page=2',
    '/clients/33ec4e84-363c-4638-9d1f-b98e9162e72a',
    '/clients/abc?tab=dispositivos&q=epson',
    '/monitors/7f65c4cb?tab=devices',
    '/devices?page=3&dir=asc',
    '/alerts?device_id=abc',
    '/incidents?open=1',
    '/activity?segment=config',
    '/supplies?client_id=abc',
    '/reports?period=2026-06',
    '/pending?client_id=abc',
  ];
  for (const target of validos) {
    test(`acepta ${target}`, () => {
      assert.equal(safeReturnTo(target), target, 'debe devolver el valor tal cual');
    });
  }
});

describe('safeReturnTo rechaza destinos externos (open redirect)', () => {
  const ataques = [
    '//evil.com',
    '//evil.com/clients',
    '/\\evil.com',
    'https://evil.com',
    'http://evil.com/clients',
    'javascript:alert(1)',
    '/javascript:alert(1)',
    'evil.com',
    'clients',
    '%2F%2Fevil.com',
    '/%2Fevil.com',
  ];
  for (const target of ataques) {
    test(`rechaza ${JSON.stringify(target)}`, () => {
      assert.equal(safeReturnTo(target), undefined);
    });
  }
});

describe('safeReturnTo rechaza rutas internas que no son de vuelta', () => {
  // Secciones reales del portal, pero que no son listados a los que volver
  // desde una ficha: si no están declaradas, no se aceptan.
  for (const target of ['/settings', '/settings#global-incident-rules', '/email-log', '/login', '/', '/remote-actions']) {
    test(`rechaza ${target}`, () => {
      assert.equal(safeReturnTo(target), undefined);
    });
  }

  test('rechaza travesía de directorios', () => {
    assert.equal(safeReturnTo('/clients/../../etc/passwd'), undefined);
    assert.equal(safeReturnTo('/devices/..'), undefined);
  });

  test('es sensible a mayúsculas, como las rutas reales', () => {
    assert.equal(safeReturnTo('/CLIENTS'), undefined);
  });
});

describe('safeReturnTo con valores ausentes', () => {
  test('null, undefined y vacío dan undefined', () => {
    assert.equal(safeReturnTo(null), undefined);
    assert.equal(safeReturnTo(undefined), undefined);
    assert.equal(safeReturnTo(''), undefined);
  });
});

describe('returnToLabel nombra la pantalla de origen', () => {
  test('usa el primer segmento del path', () => {
    assert.equal(returnToLabel('/devices?page=2'), 'Inventario');
    assert.equal(returnToLabel('/alerts'), 'Alertas');
    assert.equal(returnToLabel('/activity?segment=config'), 'Movimientos');
    assert.equal(returnToLabel('/supplies'), 'Consumibles');
  });

  test('un origen desconocido no rompe la frase', () => {
    assert.equal(returnToLabel('/lo-que-sea'), 'la pantalla anterior');
  });
});

describe('returnParamFor arma el link de ida', () => {
  test('codifica path y query juntos', () => {
    assert.equal(returnParamFor('/clients', '?segment=con_alertas'), 'from=%2Fclients%3Fsegment%3Dcon_alertas');
  });

  test('no anida el from de la pantalla actual', () => {
    // Sin esto, cada salto metía el `from` anterior adentro del nuevo y la URL
    // crecía en cada nivel (cartera → cliente → monitor → equipo).
    const param = returnParamFor('/clients/abc', '?from=%2Fclients%3Fsegment%3Dcon_alertas&tab=dispositivos');
    assert.equal(new URLSearchParams(param).get('from'), '/clients/abc?tab=dispositivos');
  });

  test('un from solo no deja el signo de pregunta colgando', () => {
    const param = returnParamFor('/clients/abc', '?from=%2Fclients');
    assert.equal(new URLSearchParams(param).get('from'), '/clients/abc');
  });

  test('lo que arma se puede volver a leer', () => {
    const param = returnParamFor('/devices', '?page=3&dir=asc');
    const raw = new URLSearchParams(param).get('from');
    assert.equal(raw, '/devices?page=3&dir=asc');
    assert.equal(safeReturnTo(raw), '/devices?page=3&dir=asc');
  });
});
