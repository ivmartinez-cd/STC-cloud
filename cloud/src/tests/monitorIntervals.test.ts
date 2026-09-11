// Intervalos de los 4 loops de monitoreo, personalizables por agente — lógica
// pura, sin servidor, sin base. Ejecutar: npx tsx --test src/tests/monitorIntervals.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMonitorIntervals, MonitorIntervalsValidationError, DEFAULT_MONITOR_INTERVALS,
} from '../shared/domain/monitor-intervals';

const VALID = {
  alert: { biz: 3, off: 15 },
  discovery: { biz: 10, off: 60 },
  meter: { biz: 20, off: 240 },
  supplies: { biz: 60, off: 240 },
};

describe('monitorIntervals — validateMonitorIntervals', () => {
  test('null explícito pasa (reset al default)', () => {
    assert.equal(validateMonitorIntervals(null), null);
  });

  test('objeto válido (los valores de siempre de HP SDS) se conserva tal cual', () => {
    assert.deepEqual(validateMonitorIntervals(VALID), VALID);
  });

  test('undefined → error', () => {
    assert.throws(() => validateMonitorIntervals(undefined), MonitorIntervalsValidationError);
  });

  test('falta un loop → error (los 4 son obligatorios si viene el objeto)', () => {
    const { supplies, ...rest } = VALID;
    assert.throws(() => validateMonitorIntervals(rest), MonitorIntervalsValidationError);
  });

  test('biz no entero o fuera de rango → error', () => {
    assert.throws(() => validateMonitorIntervals({ ...VALID, alert: { biz: 0, off: 15 } }), MonitorIntervalsValidationError);
    assert.throws(() => validateMonitorIntervals({ ...VALID, alert: { biz: 1441, off: 1441 } }), MonitorIntervalsValidationError);
    assert.throws(() => validateMonitorIntervals({ ...VALID, alert: { biz: 1.5, off: 15 } }), MonitorIntervalsValidationError);
  });

  test('off no entero o fuera de rango → error', () => {
    assert.throws(() => validateMonitorIntervals({ ...VALID, alert: { biz: 3, off: 0 } }), MonitorIntervalsValidationError);
    assert.throws(() => validateMonitorIntervals({ ...VALID, alert: { biz: 3, off: 1441 } }), MonitorIntervalsValidationError);
  });

  test('off < biz → error (fuera de horario no puede ser más rápido que en horario laboral)', () => {
    assert.throws(() => validateMonitorIntervals({ ...VALID, meter: { biz: 30, off: 20 } }), MonitorIntervalsValidationError);
  });

  test('off === biz es válido (loop constante todo el día, ej. alertas críticas 24/7)', () => {
    const out = validateMonitorIntervals({ ...VALID, alert: { biz: 3, off: 3 } });
    assert.deepEqual(out?.alert, { biz: 3, off: 3 });
  });
});

describe('monitorIntervals — DEFAULT_MONITOR_INTERVALS', () => {
  test('el default sigue siendo Alert 3/15, Identity 10/60, Meter 20/240, Consumables 60/240 (White Paper HP SDS, compat con el hardcodeado de siempre)', () => {
    assert.deepEqual(DEFAULT_MONITOR_INTERVALS, VALID);
  });
});
