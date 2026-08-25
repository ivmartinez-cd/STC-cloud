// jam-tray / print-trend (detalle de dispositivo hifi) — lógica pura, sin
// servidor, sin base. Ejecutar: npx tsx --test src/tests/deviceDetailPure.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractTrayLabel } from '../modules/devices/domain/services/jam-tray';
import { summarizePrintTrend } from '../modules/devices/domain/services/print-trend';
import type { PrintTrendMonth } from '../modules/devices/domain/entities/device-detail';

describe('extractTrayLabel — nunca inventa una bandeja', () => {
  test('mensaje sin mención de bandeja → null', () => {
    assert.equal(extractTrayLabel('Atasco de papel detectado'), null);
  });

  test('null/undefined → null', () => {
    assert.equal(extractTrayLabel(null), null);
    assert.equal(extractTrayLabel(undefined), null);
  });

  test('"bandeja 2" → "bandeja 2"', () => {
    assert.equal(extractTrayLabel('Segundo atasco en bandeja 2 en 30 días'), 'bandeja 2');
  });

  test('"Tray 3" (inglés del agente) → "bandeja 3"', () => {
    assert.equal(extractTrayLabel('Paper jam in Tray 3'), 'bandeja 3');
  });

  test('bandeja multipropósito / bypass / MP → "bandeja multipropósito"', () => {
    assert.equal(extractTrayLabel('Atasco en bandeja multipropósito'), 'bandeja multipropósito');
    assert.equal(extractTrayLabel('Jam detected: bypass tray'), 'bandeja multipropósito');
    assert.equal(extractTrayLabel('Atasco MP'), 'bandeja multipropósito');
  });
});

function month(m: string, total: number): PrintTrendMonth {
  return { month: m, month_date: new Date(`${m}-01T00:00:00Z`), mono: Math.round(total * 0.6), color: total - Math.round(total * 0.6), total };
}

describe('summarizePrintTrend — promedio/pico/proyección sobre meses completos', () => {
  test('excluye el mes corriente (último) del promedio, pico y proyección', () => {
    const months = [
      month('2026-01', 100), month('2026-02', 100), month('2026-03', 100),
      month('2026-04', 9999), // mes corriente, a mitad de transcurrir — no debe distorsionar
    ];
    const trend = summarizePrintTrend(months);
    assert.equal(trend.monthly_avg, 100);
    assert.equal(trend.peak?.total, 100);
    assert.equal(trend.projection_next_month, 100);
  });

  test('proyección = promedio de los últimos 3 meses completos', () => {
    const months = [month('2026-01', 0), month('2026-02', 60), month('2026-03', 90), month('2026-04', 120), month('2026-05', 500)];
    const trend = summarizePrintTrend(months);
    // completos: ene(0) feb(60) mar(90) abr(120) — últimos 3 completos: feb/mar/abr
    assert.equal(trend.projection_next_month, Math.round((60 + 90 + 120) / 3));
  });

  test('meses en 0 no ganan el pico', () => {
    const months = [month('2026-01', 0), month('2026-02', 0), month('2026-03', 50), month('2026-04', 0)];
    const trend = summarizePrintTrend(months);
    assert.equal(trend.peak?.month, '2026-03');
  });

  test('todos los meses completos en 0 → peak null, proyección 0 (no null: sí hay meses completos)', () => {
    const months = [month('2026-01', 0), month('2026-02', 0), month('2026-03', 0)];
    const trend = summarizePrintTrend(months);
    assert.equal(trend.peak, null);
    assert.equal(trend.projection_next_month, 0);
  });

  test('un solo mes (el corriente, sin meses completos) → avg 0, peak null, proyección null', () => {
    const trend = summarizePrintTrend([month('2026-04', 500)]);
    assert.equal(trend.monthly_avg, 0);
    assert.equal(trend.peak, null);
    assert.equal(trend.projection_next_month, null);
  });

  test('siempre devuelve los 12 meses recibidos en `months` (passthrough)', () => {
    const months = Array.from({ length: 12 }, (_, i) => month(`2026-${String(i + 1).padStart(2, '0')}`, i * 10));
    const trend = summarizePrintTrend(months);
    assert.equal(trend.months.length, 12);
  });
});
