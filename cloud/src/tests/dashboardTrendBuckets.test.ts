// Plegado de las tomas horarias de `dashboard_snapshots` en la serie que
// dibuja el panel — lógica pura, sin servidor y sin base.
// Ejecutar: npx tsx --test src/tests/dashboardTrendBuckets.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrend, rangeSpec } from '../modules/dashboard/domain/services/trend-buckets';
import type { SnapshotRow } from '../modules/dashboard/domain/entities/dashboard-snapshot';

function row(at: string, clientId: string, over: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    at: new Date(at),
    clientId,
    alertsByClass: {},
    devicesTotal: null,
    devicesManaged: null,
    agentsTotal: null,
    agentsOnline: null,
    suppliesCritical: null,
    suppliesLow: null,
    ...over,
  };
}

describe('rangeSpec — qué ventana y qué bucket pide cada rango', () => {
  test('24 h se mide por hora; 7 y 30 días, por día', () => {
    assert.equal(rangeSpec('24h').bucket, 'hour');
    assert.equal(rangeSpec('7d').bucket, 'day');
    assert.equal(rangeSpec('30d').bucket, 'day');
  });

  test('la ventana coincide con lo que dice el chip', () => {
    assert.equal(rangeSpec('7d').windowMs, 7 * 24 * 3_600_000);
    assert.equal(rangeSpec('30d').count, 30);
  });
});

describe('buildTrend — un punto por bucket, sumando los clientes del scope', () => {
  test('el punto suma a todos los clientes del bucket', () => {
    const trend = buildTrend('24h', [
      row('2026-09-16T10:05:00Z', 'a', { alertsByClass: { jam: 2 } }),
      row('2026-09-16T10:40:00Z', 'b', { alertsByClass: { jam: 1, information: 4 } }),
    ]);
    assert.equal(trend.points.length, 1);
    assert.deepEqual(trend.points[0].alertsByClass, { jam: 3, information: 4 });
    assert.equal(trend.points[0].alerts, 7);
  });

  test('dentro de un bucket manda la ÚLTIMA toma del cliente, no el promedio', () => {
    const trend = buildTrend('24h', [
      row('2026-09-16T10:05:00Z', 'a', { alertsByClass: { jam: 2 } }),
      row('2026-09-16T10:50:00Z', 'a', { alertsByClass: { jam: 9 } }),
    ]);
    assert.deepEqual(trend.points[0].alertsByClass, { jam: 9 });
  });

  test('horas distintas son puntos distintos, en orden cronológico', () => {
    const trend = buildTrend('24h', [
      row('2026-09-16T09:00:00Z', 'a', { alertsByClass: { jam: 1 } }),
      row('2026-09-16T10:00:00Z', 'a', { alertsByClass: { jam: 5 } }),
    ]);
    assert.deepEqual(trend.points.map((p) => p.alerts), [1, 5]);
  });

  test('a 7 días las tomas del mismo día colapsan en un punto', () => {
    const trend = buildTrend('7d', [
      row('2026-09-16T09:00:00Z', 'a', { alertsByClass: { jam: 1 } }),
      row('2026-09-16T20:00:00Z', 'a', { alertsByClass: { jam: 5 } }),
    ]);
    assert.equal(trend.points.length, 1);
    assert.equal(trend.points[0].alerts, 5);
  });
});

describe('buildTrend — un total a medias es peor que ningún total', () => {
  test('si a un cliente del bucket le falta la métrica, el punto queda sin ella', () => {
    const trend = buildTrend('24h', [
      row('2026-09-16T10:00:00Z', 'a', { devicesManaged: 120 }),
      row('2026-09-16T10:00:00Z', 'b', { devicesManaged: null }),
    ]);
    assert.equal(trend.points[0].devicesManaged, null);
  });

  test('con todos medidos, el punto suma', () => {
    const trend = buildTrend('24h', [
      row('2026-09-16T10:00:00Z', 'a', { devicesManaged: 120 }),
      row('2026-09-16T10:00:00Z', 'b', { devicesManaged: 21 }),
    ]);
    assert.equal(trend.points[0].devicesManaged, 141);
  });

  test('las tomas backfilleadas traen alertas pero ninguna otra cifra', () => {
    const trend = buildTrend('7d', [
      row('2026-09-10T10:00:00Z', 'a', { alertsByClass: { jam: 3 } }),
      row('2026-09-11T10:00:00Z', 'a', { alertsByClass: { jam: 4 } }),
    ]);
    assert.deepEqual(trend.points.map((p) => p.alerts), [3, 4]);
    assert.deepEqual(trend.points.map((p) => p.agentsOnline), [null, null]);
  });
});

describe('buildTrend — sin datos no se inventan puntos', () => {
  test('sin tomas, la serie es vacía (el panel no dibuja curva)', () => {
    assert.deepEqual(buildTrend('7d', []).points, []);
  });

  test('los buckets sin ninguna toma no se rellenan con ceros', () => {
    const trend = buildTrend('7d', [
      row('2026-09-10T10:00:00Z', 'a', { alertsByClass: { jam: 3 } }),
      row('2026-09-14T10:00:00Z', 'a', { alertsByClass: { jam: 8 } }),
    ]);
    assert.equal(trend.points.length, 2);
  });
});
