// Tendencia del panel de control (`features/dashboard/lib/`) — lo que decide
// si se dibuja una curva y de qué color sale la variación. Ejecutar desde la
// raíz del repo:
//   npx tsx --test cloud/portal/tests/dashboardTrend.test.ts
//
// Vive fuera de `portal/src` por el mismo motivo que los demás tests del portal.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classDeltas, seriesOf, sparkPoints } from '../src/features/dashboard/lib/trend';
import { severityMix, tierTotals } from '../src/features/dashboard/lib/alert-tiers';
import type { DashboardTrend, TrendPoint } from '../src/shared/types/monitor';

function point(at: string, over: Partial<TrendPoint> = {}): TrendPoint {
  return {
    at,
    alerts: 0,
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

function trend(points: TrendPoint[]): DashboardTrend {
  return { range: '7d', bucket: 'day', points };
}

describe('seriesOf — no se dibuja una curva que no se midió', () => {
  test('una métrica sin ninguna toma medida no da serie', () => {
    const t = trend([point('a'), point('b'), point('c')]);
    assert.equal(seriesOf(t, (p) => p.devicesManaged), null);
  });

  test('con un solo punto tampoco: una curva necesita dos', () => {
    const t = trend([point('a', { devicesManaged: 140 })]);
    assert.equal(seriesOf(t, (p) => p.devicesManaged), null);
  });

  test('los puntos sin dato se saltean, no se cuentan como cero', () => {
    const t = trend([
      point('a', { devicesManaged: 138 }),
      point('b'),
      point('c', { devicesManaged: 141 }),
    ]);
    const s = seriesOf(t, (p) => p.devicesManaged);
    assert.deepEqual(s?.values, [138, 141]);
    assert.equal(s?.delta, 3);
  });

  test('el delta es último menos primero de la ventana', () => {
    const t = trend([
      point('a', { alerts: 241 }), point('b', { alerts: 269 }), point('c', { alerts: 281 }),
    ]);
    assert.equal(seriesOf(t, (p) => p.alerts)?.delta, 40);
  });

  test('sin tendencia (fallo o aún sin historia) no hay serie', () => {
    assert.equal(seriesOf(null, (p) => p.alerts), null);
  });
});

describe('classDeltas — variación por clase entre los extremos de la ventana', () => {
  test('una clase que aparece recién ahora cuenta desde cero', () => {
    const t = trend([
      point('a', { alertsByClass: { information: 92 } }),
      point('b', { alertsByClass: { information: 98, jam: 6 } }),
    ]);
    assert.deepEqual(classDeltas(t), { information: 6, jam: 6 });
  });

  test('una clase que se resolvió del todo da variación negativa', () => {
    const t = trend([
      point('a', { alertsByClass: { jam: 4 } }),
      point('b', { alertsByClass: {} }),
    ]);
    assert.deepEqual(classDeltas(t), { jam: -4 });
  });

  test('con menos de dos puntos no hay variación que mostrar', () => {
    assert.equal(classDeltas(trend([point('a')])), null);
  });
});

describe('sparkPoints — la forma de la curva', () => {
  test('normaliza al min/max de la serie sobre la caja de 80x24', () => {
    const pts = sparkPoints([10, 20]).split(' ');
    assert.equal(pts[0], '0.0,22.0');
    assert.equal(pts[1], '80.0,2.0');
  });

  test('una serie plana va centrada, nunca pegada al borde', () => {
    assert.equal(sparkPoints([2, 2, 2]), '0.0,12.0 40.0,12.0 80.0,12.0');
  });
});

describe('severityMix — tres cuadrados que resumen la mezcla de una fila', () => {
  test('todo de un tono da los tres cuadrados de ese tono', () => {
    assert.deepEqual(severityMix({ jam: 5 }), ['critical', 'critical', 'critical']);
  });

  test('un tono minoritario no desaparece por redondeo', () => {
    // 10 informativas + 1 crítica: 0,27 cuadrados de crítica, pero existe.
    assert.ok(severityMix({ information: 10, jam: 1 }).includes('critical'));
  });

  test('siempre en orden crítica → advertencia → informativa', () => {
    assert.deepEqual(severityMix({ jam: 1, consumable_low: 1, information: 1 }), ['critical', 'warning', 'info']);
  });

  test('sin alertas no hay mezcla que dibujar', () => {
    assert.deepEqual(severityMix({}), []);
  });
});

describe('tierTotals — el desglose por severidad se deriva de las clases', () => {
  test('las clases desconocidas caen en informativas', () => {
    assert.deepEqual(tierTotals({ clase_que_no_existe: 3 }), { critical: 0, warning: 0, info: 3 });
  });

  test('suma cada clase en su balde', () => {
    assert.deepEqual(
      tierTotals({ jam: 6, consumable_out: 10, consumable_low: 16, information: 98 }),
      { critical: 16, warning: 16, info: 98 }
    );
  });
});
