// Detalle histórico de un consumible (modal "Detalles del consumible") —
// lógica pura, sin servidor y sin base.
// Ejecutar: npx tsx --test src/tests/supplyHistoryPure.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCycle, detectReplacements, withRequestDeltas,
} from '../modules/supplies/domain/services/supply-history-builder';
import { AUTO_COMPLETE_RISE_PCT } from '../modules/supply-requests';
import type {
  SupplyLevelPoint, SupplyRequestHistoryRow,
} from '../modules/supplies/domain/entities/supply-history';

const RISE = AUTO_COMPLETE_RISE_PCT;

function pt(day: string, level: number | null, total: number | null = null, mono: number | null = null, color: number | null = null): SupplyLevelPoint {
  return { day, level, total_pages: total, mono_pages: mono, color_pages: color };
}

describe('detectReplacements — sólo saltos reales, nunca un rebote de lectura', () => {
  test('serie que sólo baja no tiene reemplazos', () => {
    const points = [pt('2026-01-01', 90), pt('2026-01-02', 70), pt('2026-01-03', 40)];
    assert.deepEqual(detectReplacements(points, RISE), []);
  });

  test('un rebote menor al umbral NO cuenta como reemplazo', () => {
    const points = [pt('2026-01-01', 40), pt('2026-01-02', 40 + RISE - 1)];
    assert.deepEqual(detectReplacements(points, RISE), []);
  });

  test('salto de 6% a 100% es un cartucho nuevo', () => {
    const points = [pt('2026-01-01', 30), pt('2026-01-02', 6), pt('2026-01-03', 100)];
    assert.deepEqual(detectReplacements(points, RISE), [{ at: '2026-01-03', from_pct: 6, to_pct: 100 }]);
  });

  test('los días sin lectura no cortan la comparación ni inventan un salto', () => {
    const points = [pt('2026-01-01', 8), pt('2026-01-02', null), pt('2026-01-03', 95)];
    assert.equal(detectReplacements(points, RISE).length, 1);
  });

  test('dos reemplazos en la misma serie se detectan los dos', () => {
    const points = [pt('2026-01-01', 10), pt('2026-01-02', 100), pt('2026-02-01', 5), pt('2026-02-02', 98)];
    assert.deepEqual(detectReplacements(points, RISE).map((r) => r.at), ['2026-01-02', '2026-02-02']);
  });
});

describe('buildCycle — se mide desde el último reemplazo, no desde el inicio de la serie', () => {
  test('sin lecturas con nivel, el ciclo queda vacío y no se inventan estimaciones', () => {
    const cycle = buildCycle([pt('2026-01-01', null)], []);
    assert.equal(cycle.started_at, null);
    assert.equal(cycle.est_total_remaining, null);
  });

  test('reproduce los números del SDS: 98%→90% con 486 páginas ⇒ 5.468 restantes (376 color ⇒ 4.230)', () => {
    const points = [
      pt('2026-09-01', 30, 38_000, 20_000, 18_000),   // cartucho anterior, queda fuera del ciclo
      pt('2026-09-09', 98, 38_507, 20_100, 18_407),   // reemplazo
      pt('2026-09-15', 90, 38_993, 20_210, 18_783),
    ];
    const replacements = detectReplacements(points, RISE);
    assert.equal(replacements.length, 1);
    const cycle = buildCycle(points, replacements);
    assert.equal(cycle.started_at, '2026-09-09');
    assert.equal(cycle.initial_level, 98);
    assert.equal(cycle.used_pct, 8);
    assert.equal(cycle.days_in_use, 6);
    assert.equal(cycle.total_printed, 486);
    assert.equal(cycle.mono_printed, 110);
    assert.equal(cycle.color_printed, 376);
    assert.equal(cycle.cycles_at_start, 38_507);
    assert.equal(cycle.est_total_remaining, 5_468);
    assert.equal(cycle.est_color_remaining, 4_230);
  });

  test('un contador que retrocede (reset del equipo) no produce un delta negativo', () => {
    const points = [pt('2026-01-01', 90, 500), pt('2026-01-05', 80, 10)];
    assert.equal(buildCycle(points, []).total_printed, null);
  });

  test('sin consumo todavía (nivel igual) no se estima nada en vez de dividir por cero', () => {
    const points = [pt('2026-01-01', 100, 100), pt('2026-01-02', 100, 150)];
    const cycle = buildCycle(points, []);
    assert.equal(cycle.used_pct, 0);
    assert.equal(cycle.est_total_remaining, null);
  });
});

function req(id: string, opened: string, total: number | null, color: number | null): SupplyRequestHistoryRow {
  return {
    id, opened_at: opened, external_ref: null, description: null, supply_serial: null, sku: null,
    reason: 'low_level', level_pct: 5, remaining_days: 10, mono_pages: null, color_pages: color,
    total_pages: total, status: 'completed', origin: 'auto', replaced_at: null,
    delta_total: null, delta_color: null,
  };
}

describe('withRequestDeltas — Δ contra la solicitud anterior, descendente para la UI', () => {
  test('la primera solicitud no tiene Δ (no hay contra qué comparar)', () => {
    const [only] = withRequestDeltas([req('a', '2026-01-01', 1000, 400)]);
    assert.equal(only.delta_total, null);
    assert.equal(only.delta_color, null);
  });

  test('Δ = contadores de esta solicitud menos los de la anterior', () => {
    const rows = withRequestDeltas([
      req('a', '2026-01-01', 1000, 400),
      req('b', '2026-06-01', 7348, 5884),
    ]);
    assert.deepEqual(rows.map((r) => r.id), ['b', 'a']); // descendente
    assert.equal(rows[0].delta_total, 6348);
    assert.equal(rows[0].delta_color, 5484);
  });

  test('sin snapshot en alguna punta el Δ queda null, nunca en 0', () => {
    const rows = withRequestDeltas([
      req('a', '2026-01-01', null, null),
      req('b', '2026-06-01', 7348, 5884),
    ]);
    assert.equal(rows[0].delta_total, null);
    assert.equal(rows[0].delta_color, null);
  });
});
