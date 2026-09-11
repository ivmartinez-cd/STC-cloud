// Intervalos de monitoreo personalizables por agente — lógica pura.
// Ejecutar: npx tsx --test src/tests/monitorIntervals.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntervals, DEFAULT_MONITOR_INTERVALS } from '../core/MonitorIntervals';

describe('MonitorIntervals — resolveIntervals', () => {
  test('config ausente → DEFAULT_MONITOR_INTERVALS convertido a ms', () => {
    assert.deepEqual(resolveIntervals(undefined), {
      alert:     { biz: 3 * 60_000,  off: 15 * 60_000 },
      discovery: { biz: 10 * 60_000, off: 60 * 60_000 },
      meter:     { biz: 20 * 60_000, off: 240 * 60_000 },
      supplies:  { biz: 60 * 60_000, off: 240 * 60_000 },
    });
  });

  test('config null → mismo default que ausente (reset explícito)', () => {
    assert.deepEqual(resolveIntervals(null), resolveIntervals(undefined));
  });

  test('config personalizado se convierte a ms tal cual, sin mezclar con el default', () => {
    const out = resolveIntervals({
      alert:     { biz: 1, off: 5 },
      discovery: { biz: 5, off: 30 },
      meter:     { biz: 10, off: 120 },
      supplies:  { biz: 30, off: 120 },
    });
    assert.deepEqual(out, {
      alert:     { biz: 60_000,      off: 300_000 },
      discovery: { biz: 300_000,     off: 1_800_000 },
      meter:     { biz: 600_000,     off: 7_200_000 },
      supplies:  { biz: 1_800_000,   off: 7_200_000 },
    });
  });

  test('DEFAULT_MONITOR_INTERVALS sigue siendo Alert 3/15, Identity 10/60, Meter 20/240, Consumables 60/240 (White Paper HP SDS)', () => {
    assert.deepEqual(DEFAULT_MONITOR_INTERVALS, {
      alert:     { biz: 3,  off: 15 },
      discovery: { biz: 10, off: 60 },
      meter:     { biz: 20, off: 240 },
      supplies:  { biz: 60, off: 240 },
    });
  });
});
