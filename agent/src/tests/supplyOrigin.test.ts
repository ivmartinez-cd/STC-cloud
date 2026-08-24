// Clasificador de origen de consumible (Fase 10 del gap analysis vs HP SDS) —
// sin red, tabla de casos. Ejecutar: npx tsx --test src/tests/supplyOrigin.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifySupplyOrigin, worstSupplyOrigin } from '../capture/supplyOrigin';

describe('classifySupplyOrigin — casos non_genuine', () => {
  const cases: string[] = [
    'Non-HP supply in use',
    'non-hp cartridge detected',
    'NonHP',
    'Non-genuine supply installed',
    'Not genuine cartridge',
    'No original — reemplazar cartucho',
    'Cartucho não original detectado',
    'Remanufactured cartridge in use',
    'Used or counterfeit cartridge',
    'Counterfeit chip detected',
    'Cartucho compatible instalado',
    'Compatible cartridge',
    'Cartucho clonado',
    'Cartucho refillado',
    'Refilled cartridge',
  ];
  for (const text of cases) {
    test(`"${text}" → non_genuine`, () => {
      assert.equal(classifySupplyOrigin(text), 'non_genuine');
    });
  }
});

describe('classifySupplyOrigin — casos genuine', () => {
  const cases: string[] = [
    'Genuine HP cartridge installed',
    'Original HP CE390A',
    'HP Original',
    'Cartucho original instalado',
    'Autentico',
  ];
  for (const text of cases) {
    test(`"${text}" → genuine`, () => {
      assert.equal(classifySupplyOrigin(text), 'genuine');
    });
  }
});

describe('classifySupplyOrigin — falsos amigos y casos sin señal', () => {
  test('"Black Cartridge HP CE390A" (sin palabra de estado) → null', () => {
    assert.equal(classifySupplyOrigin('Black Cartridge HP CE390A'), null);
  });
  test('"Toner Cartridge Black" → null', () => {
    assert.equal(classifySupplyOrigin('Toner Cartridge Black'), null);
  });
  test('texto vacío/null/undefined → null', () => {
    assert.equal(classifySupplyOrigin(''), null);
    assert.equal(classifySupplyOrigin(null), null);
    assert.equal(classifySupplyOrigin(undefined), null);
  });
  test('"Non-HP" dentro de una frase larga con "genuine" también presente → non_genuine gana (falso amigo real)', () => {
    // Caso adversarial: un texto que menciona ambas palabras — el negativo
    // debe ganar siempre (más caro reportar "genuine" incorrecto que al revés).
    assert.equal(classifySupplyOrigin('Cartridge is not the genuine HP type — Non-HP detected'), 'non_genuine');
  });
});

describe('worstSupplyOrigin — roll-up de los 4 tóners', () => {
  test('un solo non_genuine entre varios genuine → non_genuine', () => {
    assert.equal(worstSupplyOrigin(['genuine', 'non_genuine', 'genuine', null]), 'non_genuine');
  });
  test('todos genuine → genuine', () => {
    assert.equal(worstSupplyOrigin(['genuine', 'genuine']), 'genuine');
  });
  test('todos null/undefined → null (nunca "genuine" por defecto)', () => {
    assert.equal(worstSupplyOrigin([null, undefined, null]), null);
  });
  test('array vacío → null', () => {
    assert.equal(worstSupplyOrigin([]), null);
  });
});
