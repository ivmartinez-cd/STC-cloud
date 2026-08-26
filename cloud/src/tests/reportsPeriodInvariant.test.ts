// Lógica pura de totales del cierre — sin servidor, sin base. Handoff hifi
// #3, fase 5, 26/08/2026: bug real en `knex-period-usage-query.ts` donde
// `delta_total`/`delta_mono`/`delta_color` se sumaban con 3 SUM(GREATEST)
// independientes sin garantía de que total = mono + color. `delta_other`
// (residuo explícito) es el arreglo — este test verifica que
// `sumUsageTotals` mantiene la igualdad SIEMPRE, incluso con datos donde
// total ≠ mono + color por fila.
// Ejecutar: npx tsx --test src/tests/reportsPeriodInvariant.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sumUsageTotals, closureMeta } from '../modules/reports/domain/services/period';
import type { PeriodUsageLine } from '../modules/reports/domain/entities/period-usage-line';

function line(overrides: Partial<PeriodUsageLine>): PeriodUsageLine {
  return {
    device_id: 'd1', serial_number: null, model: null, brand: null, agent_id: null, agent_name: null,
    source: null, first_reading_at: null, first_total: null, first_mono: null, first_color: null,
    last_reading_at: null, last_total: null, last_mono: null, last_color: null,
    delta_total: 0, delta_mono: 0, delta_color: 0, delta_other: 0, delta_estimated: null,
    had_counter_reset: false,
    ...overrides,
  };
}

describe('sumUsageTotals — invariante total = mono + color + other', () => {
  test('caso normal (mono+color=total, delta_other=0 por línea)', () => {
    const lines = [
      line({ delta_total: 100, delta_mono: 100, delta_color: 0, delta_other: 0 }),
      line({ delta_total: 50, delta_mono: 30, delta_color: 20, delta_other: 0 }),
    ];
    const totals = sumUsageTotals(lines);
    assert.equal(totals.totalPages, totals.totalMono + totals.totalColor + totals.totalOther);
    assert.equal(totals.totalOther, 0);
  });

  test('mono/color NULL-skipped por SUM independiente (el bug real): delta_other absorbe la diferencia', () => {
    // Escenario real: total_pages nunca fue NULL, pero mono_pages/color_pages
    // sí lo fueron en algunas lecturas — el SUM(GREATEST(mono_delta,0)) del
    // backend las salteó silenciosamente, dejando mono+color por debajo del
    // total real. El residuo lo hace explícito en vez de esconder la brecha.
    const lines = [
      line({ delta_total: 200, delta_mono: 50, delta_color: 30, delta_other: 120 }),
    ];
    const totals = sumUsageTotals(lines);
    assert.equal(totals.totalPages, 200);
    assert.equal(totals.totalOther, 120);
    assert.equal(totals.totalPages, totals.totalMono + totals.totalColor + totals.totalOther);
  });

  test('invariante se mantiene sumando muchas líneas con residuos mixtos (positivos y negativos)', () => {
    const lines = Array.from({ length: 20 }, (_, i) => {
      const total = i * 7;
      const mono = Math.floor(total / 2);
      const color = Math.floor(total / 3);
      return line({ delta_total: total, delta_mono: mono, delta_color: color, delta_other: total - mono - color });
    });
    const totals = sumUsageTotals(lines);
    assert.equal(totals.totalPages, totals.totalMono + totals.totalColor + totals.totalOther);
  });
});

describe('closureMeta — deviceCount/anomaliesCount congelados del header', () => {
  test('cuenta líneas totales y sólo las que tuvieron reset de contador', () => {
    const lines = [
      line({ had_counter_reset: false }),
      line({ had_counter_reset: true }),
      line({ had_counter_reset: true }),
    ];
    const meta = closureMeta(lines);
    assert.equal(meta.deviceCount, 3);
    assert.equal(meta.anomaliesCount, 2);
  });

  test('sin líneas → ambos en 0', () => {
    assert.deepEqual(closureMeta([]), { deviceCount: 0, anomaliesCount: 0 });
  });
});
