// Unitario puro (sin API ni base) sobre modules/inventory/domain — Fase 5 del
// plan de migración: sube la cobertura del dominio de inventario a los
// mínimos de la guía cubriendo las ramas de validación/coerción que los tests
// de integración (inventoryFields.test.ts) no ejercitan.
// Ejecutar: npx tsx --test src/tests/customFieldRules.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCustomFieldData,
  normalizeAndValidateKey,
  validateCreateOptions,
  validateLabel,
  validateType,
} from '../modules/inventory/domain/services/custom-field-rules';
import { CustomFieldError } from '../modules/inventory/domain/errors/custom-field-error';
import type { CustomFieldDef } from '../modules/inventory/domain/entities/custom-field-def';

const def = (key: string, type: CustomFieldDef['type'], options: string[] | null = null): CustomFieldDef =>
  ({ key, type, options, label: key } as unknown as CustomFieldDef);

const DEFS = [
  def('notes', 'text'),
  def('floor', 'number'),
  def('purchased', 'date'),
  def('leased', 'boolean'),
  def('area', 'select', ['ventas', 'admin']),
];

describe('custom-field-rules — definiciones', () => {
  test('key: se normaliza (trim + minúsculas) y rechaza formas inválidas', () => {
    assert.equal(normalizeAndValidateKey('  Floor_Number '), 'floor_number');
    for (const bad of ['1abc', 'con espacio', 'ñu', '', 'a'.repeat(65)]) {
      assert.throws(() => normalizeAndValidateKey(bad), CustomFieldError, bad);
    }
  });

  test('type: sólo los cinco tipos válidos', () => {
    for (const ok of ['text', 'number', 'date', 'select', 'boolean']) assert.doesNotThrow(() => validateType(ok));
    assert.throws(() => validateType('json'), CustomFieldError);
  });

  test('label: trim y requerido', () => {
    assert.equal(validateLabel('  Piso '), 'Piso');
    assert.throws(() => validateLabel('   '), CustomFieldError);
  });

  test('options: sólo select las exige; se limpian vacíos; no-select devuelve null', () => {
    assert.equal(validateCreateOptions('text', ['x']), null);
    assert.throws(() => validateCreateOptions('select', []), CustomFieldError);
    assert.throws(() => validateCreateOptions('select', 'a,b'), CustomFieldError);
    assert.deepEqual(validateCreateOptions('select', [' a ', '', 'b']), ['a', 'b']);
  });
});

describe('custom-field-rules — mergeCustomFieldData', () => {
  test('merge parcial: conserva claves no incluidas en el patch', () => {
    const merged = mergeCustomFieldData(DEFS, { notes: 'viejo', floor: 2 }, { floor: 3 });
    assert.deepEqual(merged, { notes: 'viejo', floor: 3 });
  });

  test('null limpia el valor sin validar el tipo', () => {
    assert.deepEqual(mergeCustomFieldData(DEFS, { floor: 2 }, { floor: null }), { floor: null });
  });

  test('clave desconocida → CustomFieldError 400', () => {
    assert.throws(() => mergeCustomFieldData(DEFS, null, { color: 'rojo' }), (e: unknown) =>
      e instanceof CustomFieldError && e.statusCode === 400 && /desconocido/.test(e.message));
  });

  test('coerción por tipo: text recorta a 500, number/date validan, boolean castea, select restringe', () => {
    const merged = mergeCustomFieldData(DEFS, null, {
      notes: 'x'.repeat(600),
      floor: '7',
      purchased: '2026-08-25T13:00:00Z',
      leased: 1,
      area: 'admin',
    });
    assert.equal((merged.notes as string).length, 500);
    assert.equal(merged.floor, 7);
    assert.equal(merged.purchased, '2026-08-25');
    assert.equal(merged.leased, true);
    assert.equal(merged.area, 'admin');
  });

  test('number no numérico, date inválida y select fuera de opciones → CustomFieldError', () => {
    assert.throws(() => mergeCustomFieldData(DEFS, null, { floor: 'alto' }), /numérico/);
    assert.throws(() => mergeCustomFieldData(DEFS, null, { purchased: 'ayer' }), /fecha/);
    assert.throws(() => mergeCustomFieldData(DEFS, null, { area: 'it' }), /fuera de las opciones/);
  });

  test('select sin options definidas: ningún valor es válido', () => {
    assert.throws(() => mergeCustomFieldData([def('area', 'select', null)], null, { area: 'x' }), CustomFieldError);
  });
});
