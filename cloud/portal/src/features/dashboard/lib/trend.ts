import type { DashboardTrend, TrendPoint, TrendRange } from '../../../shared/types/monitor';

/**
 * Deriva del historial (`GET /dashboard/trend`) lo que dibuja el titular:
 * la serie de la sparkline y la variación del período.
 *
 * Todo sale de la MISMA serie que se está dibujando — el delta es el último
 * punto menos el primero, no un número aparte que pueda discrepar de la curva.
 *
 * Una serie sin al menos dos puntos con dato devuelve `null`: significa que
 * esa métrica todavía no tiene historia (las tomas arrancan cuando se despliega
 * el job horario; sólo las alertas vienen backfilleadas). El titular entonces
 * no dibuja nada en vez de inventar una línea plana.
 */

export type TrendMetric = (p: TrendPoint) => number | null;

export interface Series {
  values: number[];
  first: number;
  last: number;
  delta: number;
}

export function seriesOf(trend: DashboardTrend | null | undefined, metric: TrendMetric): Series | null {
  if (!trend) return null;
  const values: number[] = [];
  for (const p of trend.points) {
    const v = metric(p);
    if (v != null) values.push(v);
  }
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return { values, first, last, delta: last - first };
}

/** "en 7 días" / "en 24 h" — la ventana que el delta está comparando. */
export function deltaNote(range: TrendRange): string {
  if (range === '24h') return 'en 24 h';
  return range === '7d' ? 'en 7 días' : 'en 30 días';
}

/** Variación por clase de alerta entre el primer y el último punto de la ventana. */
export function classDeltas(trend: DashboardTrend | null | undefined): Record<string, number> | null {
  if (!trend || trend.points.length < 2) return null;
  const first = trend.points[0].alertsByClass;
  const last = trend.points[trend.points.length - 1].alertsByClass;
  const out: Record<string, number> = {};
  for (const cls of new Set([...Object.keys(first), ...Object.keys(last)])) {
    out[cls] = (last[cls] ?? 0) - (first[cls] ?? 0);
  }
  return out;
}

/**
 * Puntos del `polyline` de la sparkline, normalizados al min/max de la serie
 * sobre una caja de 80×24 (`preserveAspectRatio="none"` la estira al ancho
 * real). Una serie sin varianza va centrada en y=12 — nunca pegada al borde,
 * que se leería como "tocando fondo".
 */
export function sparkPoints(values: number[]): string {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 80;
      const y = span === 0 ? 12 : 22 - ((v - min) / span) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
