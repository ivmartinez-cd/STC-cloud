// Horario laboral + TZ configurable (§2.1/§3 R7 gap analysis).
// Ejecutar: npx tsx --test src/tests/businessHours.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isBusinessHours, DEFAULT_BUSINESS_HOURS, type BusinessHoursConfig } from '../core/BusinessHours';
import { getConfiguredTimezone, setConfiguredTimezone, getUtcOffsetString } from '../core/TimeZoneUtils';

describe('BusinessHours — isBusinessHours', () => {
  test('sin config (undefined) usa el default hardcodeado — mismo comportamiento de siempre', () => {
    // No podemos fijar "ahora" en el test, pero sí confirmar que undefined y
    // el default explícito dan exactamente el mismo resultado.
    assert.equal(isBusinessHours(undefined), isBusinessHours(DEFAULT_BUSINESS_HOURS));
  });

  test('null también cae al default', () => {
    assert.equal(isBusinessHours(null), isBusinessHours(DEFAULT_BUSINESS_HOURS));
  });

  test('un miércoles a las 10hs (Argentina) es laborable en L-V pero no en sáb/dom', () => {
    // 2026-08-19 12:00 UTC = 2026-08-19 09:00 -03:00 (miércoles, dentro de 8-18)
    const wednesday10am = new Date('2026-08-19T12:00:00Z');
    assert.equal(isBusinessHours(DEFAULT_BUSINESS_HOURS, wednesday10am), true);
    const weekendOnly: BusinessHoursConfig = { ...DEFAULT_BUSINESS_HOURS, days: [6, 7] };
    assert.equal(isBusinessHours(weekendOnly, wednesday10am), false);
  });

  test('un miércoles a las 22hs (Argentina) es fuera de horario aunque el día esté habilitado', () => {
    // 2026-08-20 01:00 UTC = 2026-08-19 22:00 -03:00 (miércoles, fuera de 8-18)
    const wednesday10pm = new Date('2026-08-20T01:00:00Z');
    assert.equal(isBusinessHours(DEFAULT_BUSINESS_HOURS, wednesday10pm), false);
  });

  test('rango horario 0-24 con los 7 días siempre da true (cualquier hora, cualquier día)', () => {
    const alwaysOn: BusinessHoursConfig = { timezone: DEFAULT_BUSINESS_HOURS.timezone, days: [1,2,3,4,5,6,7], start_hour: 0, end_hour: 24 };
    assert.equal(isBusinessHours(alwaysOn), true);
  });

  test('TZ inválida no revienta — Intl.DateTimeFormat con una TZ real sigue funcionando', () => {
    // isBusinessHours no valida la TZ (eso lo hace el cloud); confirmamos
    // simplemente que con una TZ real no lanza.
    assert.doesNotThrow(() => isBusinessHours({ timezone: 'America/Santiago', days: [1,2,3,4,5], start_hour: 8, end_hour: 18 }));
  });
});

describe('TimeZoneUtils — getConfiguredTimezone / setConfiguredTimezone', () => {
  test('default inicial es el TZ hardcodeado de Argentina', () => {
    setConfiguredTimezone(undefined);
    assert.equal(getConfiguredTimezone(), DEFAULT_BUSINESS_HOURS.timezone);
  });

  test('setConfiguredTimezone actualiza el valor leído por getConfiguredTimezone', () => {
    setConfiguredTimezone('America/Santiago');
    assert.equal(getConfiguredTimezone(), 'America/Santiago');
    setConfiguredTimezone(null); // vuelve al default para no filtrar estado a otros tests
    assert.equal(getConfiguredTimezone(), DEFAULT_BUSINESS_HOURS.timezone);
  });

  test('string vacío o sólo espacios también cae al default', () => {
    setConfiguredTimezone('   ');
    assert.equal(getConfiguredTimezone(), DEFAULT_BUSINESS_HOURS.timezone);
  });
});

describe('TimeZoneUtils — getUtcOffsetString', () => {
  test('Argentina es siempre -03:00 (sin DST)', () => {
    assert.equal(getUtcOffsetString('America/Argentina/Buenos_Aires', new Date('2026-01-15T12:00:00Z')), '-03:00');
    assert.equal(getUtcOffsetString('America/Argentina/Buenos_Aires', new Date('2026-07-15T12:00:00Z')), '-03:00');
  });

  test('Tokio es siempre +09:00 (sin DST)', () => {
    assert.equal(getUtcOffsetString('Asia/Tokyo', new Date('2026-01-15T12:00:00Z')), '+09:00');
  });

  test('Madrid varía con DST (CET/CEST)', () => {
    const winter = getUtcOffsetString('Europe/Madrid', new Date('2026-01-15T12:00:00Z'));
    const summer = getUtcOffsetString('Europe/Madrid', new Date('2026-07-15T12:00:00Z'));
    assert.equal(winter, '+01:00');
    assert.equal(summer, '+02:00');
  });

  test('UTC da +00:00', () => {
    assert.equal(getUtcOffsetString('UTC', new Date()), '+00:00');
  });
});
