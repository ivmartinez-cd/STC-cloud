// Horario laboral + TZ configurable (§2.1/§3 R7 gap analysis) — lógica pura,
// sin servidor, sin base. Ejecutar: npx tsx --test src/tests/businessHours.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBusinessHours, getUtcOffsetString, parseNaiveLocalTimestamp,
  BusinessHoursValidationError, DEFAULT_BUSINESS_HOURS,
} from '../services/businessHours';

describe('businessHours — validateBusinessHours', () => {
  test('null explícito pasa (reset al default)', () => {
    assert.equal(validateBusinessHours(null), null);
  });

  test('objeto válido se conserva normalizado (days ordenados y sin duplicados)', () => {
    const out = validateBusinessHours({ timezone: 'America/Santiago', days: [5, 1, 3, 1], start_hour: 9, end_hour: 17 });
    assert.deepEqual(out, { timezone: 'America/Santiago', days: [1, 3, 5], start_hour: 9, end_hour: 17 });
  });

  test('undefined → error', () => {
    assert.throws(() => validateBusinessHours(undefined), BusinessHoursValidationError);
  });

  test('TZ inválida → error', () => {
    assert.throws(() => validateBusinessHours({ timezone: 'No/Existe', days: [1], start_hour: 8, end_hour: 18 }), BusinessHoursValidationError);
  });

  test('TZ vacía → error', () => {
    assert.throws(() => validateBusinessHours({ timezone: '', days: [1], start_hour: 8, end_hour: 18 }), BusinessHoursValidationError);
  });

  test('days vacío → error (rechazado, no aceptado silenciosamente)', () => {
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [], start_hour: 8, end_hour: 18 }), BusinessHoursValidationError);
  });

  test('days con un valor fuera de 1-7 → error', () => {
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [0, 1], start_hour: 8, end_hour: 18 }), BusinessHoursValidationError);
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1, 8], start_hour: 8, end_hour: 18 }), BusinessHoursValidationError);
  });

  test('start_hour fuera de 0-23 → error', () => {
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: -1, end_hour: 18 }), BusinessHoursValidationError);
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: 24, end_hour: 18 }), BusinessHoursValidationError);
  });

  test('end_hour fuera de 1-24 → error', () => {
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: 8, end_hour: 0 }), BusinessHoursValidationError);
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: 8, end_hour: 25 }), BusinessHoursValidationError);
  });

  test('start_hour >= end_hour → error', () => {
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: 18, end_hour: 8 }), BusinessHoursValidationError);
    assert.throws(() => validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: 8, end_hour: 8 }), BusinessHoursValidationError);
  });

  test('end_hour = 24 ("hasta medianoche") es válido', () => {
    const out = validateBusinessHours({ timezone: 'America/Santiago', days: [1], start_hour: 8, end_hour: 24 });
    assert.equal(out?.end_hour, 24);
  });
});

describe('businessHours — getUtcOffsetString', () => {
  test('Argentina -03:00 sin DST en verano e invierno', () => {
    assert.equal(getUtcOffsetString('America/Argentina/Buenos_Aires', new Date('2026-01-15T12:00:00Z')), '-03:00');
    assert.equal(getUtcOffsetString('America/Argentina/Buenos_Aires', new Date('2026-07-15T12:00:00Z')), '-03:00');
  });

  test('Madrid varía con DST (CET +01:00 invierno, CEST +02:00 verano)', () => {
    assert.equal(getUtcOffsetString('Europe/Madrid', new Date('2026-01-15T12:00:00Z')), '+01:00');
    assert.equal(getUtcOffsetString('Europe/Madrid', new Date('2026-07-15T12:00:00Z')), '+02:00');
  });

  test('New York varía con DST (EST -05:00 invierno, EDT -04:00 verano)', () => {
    assert.equal(getUtcOffsetString('America/New_York', new Date('2026-01-15T12:00:00Z')), '-05:00');
    assert.equal(getUtcOffsetString('America/New_York', new Date('2026-07-15T12:00:00Z')), '-04:00');
  });

  test('Tokio +09:00 sin DST', () => {
    assert.equal(getUtcOffsetString('Asia/Tokyo', new Date('2026-01-15T12:00:00Z')), '+09:00');
  });
});

describe('businessHours — parseNaiveLocalTimestamp', () => {
  test('formato DD/MM/YYYY HH:mm:ss se interpreta con el offset de la TZ dada', () => {
    const d = parseNaiveLocalTimestamp('15/01/2026 10:30:00', 'America/Argentina/Buenos_Aires');
    assert.ok(d);
    assert.equal(d!.toISOString(), new Date('2026-01-15T13:30:00.000Z').toISOString());
  });

  test('la misma fecha/hora naive con otra TZ da un instante UTC distinto', () => {
    // En julio (invierno austral) Chile es -04:00 y Argentina -03:00 — en
    // enero ambos coinciden en -03:00 (Chile observa DST en verano), por eso
    // se usa una fecha de invierno para que la diferencia sea real.
    const ar = parseNaiveLocalTimestamp('15/07/2026 10:30:00', 'America/Argentina/Buenos_Aires');
    const cl = parseNaiveLocalTimestamp('15/07/2026 10:30:00', 'America/Santiago');
    assert.notEqual(ar!.toISOString(), cl!.toISOString());
  });

  test('formato ISO (agente actual) devuelve null — el caller cae a new Date(raw)', () => {
    assert.equal(parseNaiveLocalTimestamp('2026-01-15T10:30:00.000Z', 'America/Argentina/Buenos_Aires'), null);
  });

  test('string sin fecha reconocible devuelve null', () => {
    assert.equal(parseNaiveLocalTimestamp('no es una fecha', 'America/Argentina/Buenos_Aires'), null);
  });

  test('el offset se ancla al timestamp naive parseado, no a "ahora" (regresión DST)', () => {
    // 15/07 en Madrid es verano (CEST +02:00) aunque "ahora" (al correr el
    // test) sea otra época del año con otro offset — si el fix ancla a
    // `new Date()` en vez del propio timestamp, este assert fallaría en
    // invierno.
    const d = parseNaiveLocalTimestamp('15/07/2026 10:00:00', 'Europe/Madrid');
    assert.equal(d!.toISOString(), new Date('2026-07-15T08:00:00.000Z').toISOString());
  });
});

describe('businessHours — DEFAULT_BUSINESS_HOURS', () => {
  test('el default sigue siendo Argentina, L-V, 8-18 (compat con el comportamiento hardcodeado de siempre)', () => {
    assert.deepEqual(DEFAULT_BUSINESS_HOURS, {
      timezone: 'America/Argentina/Buenos_Aires',
      days: [1, 2, 3, 4, 5],
      start_hour: 8,
      end_hour: 18,
    });
  });
});
