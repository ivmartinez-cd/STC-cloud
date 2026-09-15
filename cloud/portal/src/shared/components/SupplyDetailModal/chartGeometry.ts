import type { SupplyHistoryRange, SupplyLevelPoint } from '../../types/supplyHistory';

/**
 * Geometría pura de los dos gráficos del modal "Detalles del consumible".
 * Sin React y sin DOM: se puede razonar (y testear) sin montar nada.
 *
 * Los SVG usan un espacio de coordenadas fijo (`VIEW_W`×`VIEW_H`) escalado
 * con `viewBox` + `width:100%` — mismo criterio "sin librería" que el resto
 * de los gráficos del portal (`PrintTrendCard`, `ClientUsageChart`).
 */

export const VIEW_W = 1000;

export interface Plot {
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

export const LEVEL_PLOT: Plot = { h: 210, padL: 30, padR: 6, padT: 10, padB: 20 };
export const COUNTERS_PLOT: Plot = { h: 150, padL: 46, padR: 6, padT: 10, padB: 20 };
export const BRUSH_PLOT: Plot = { h: 58, padL: 0, padR: 0, padT: 4, padB: 14 };

const MONTHS_BACK: Record<SupplyHistoryRange, number | null> = { '12m': 12, '24m': 24, all: null };

/** Recorta la serie completa a la ventana elegida. `all` no copia el array. */
export function sliceByRange(points: SupplyLevelPoint[], range: SupplyHistoryRange): SupplyLevelPoint[] {
  const months = MONTHS_BACK[range];
  if (months == null || !points.length) return points;
  const last = new Date(points[points.length - 1].day);
  const from = new Date(last);
  from.setMonth(from.getMonth() - months);
  const cut = from.toISOString().slice(0, 10);
  const i = points.findIndex((p) => p.day >= cut);
  return i <= 0 ? points : points.slice(i);
}

export function xAt(i: number, n: number, plot: Plot): number {
  const span = VIEW_W - plot.padL - plot.padR;
  return n <= 1 ? plot.padL + span / 2 : plot.padL + (i / (n - 1)) * span;
}

export function yAt(value: number, max: number, plot: Plot): number {
  const span = plot.h - plot.padT - plot.padB;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return plot.padT + (1 - ratio) * span;
}

/** Índice de la serie bajo un ratio horizontal 0..1 del ancho del plot. */
export function indexFromRatio(ratio: number, n: number): number {
  if (n <= 1) return 0;
  return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
}

interface StepInput {
  values: Array<number | null>;
  max: number;
  plot: Plot;
}

/**
 * Escalera: el nivel de un consumible no interpola — se mantiene hasta la
 * lectura siguiente. Los tramos sin lectura (`null`) cortan la línea en vez
 * de unir dos puntos lejanos con una diagonal inventada.
 */
export function stepSegments({ values, max, plot }: StepInput): string[] {
  const n = values.length;
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length > 1) out.push(current.join(' ')); current = []; };
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null) { flush(); continue; }
    const x = xAt(i, n, plot), y = yAt(v, max, plot);
    if (!current.length) current.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
    else current.push(`L ${x.toFixed(1)} ${current.at(-1)!.split(' ')[2]}`, `L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  flush();
  return out;
}

/** Área bajo la escalera: el mismo camino cerrado contra la base del plot. */
export function stepAreaPath(input: StepInput): string {
  const segments = stepSegments(input);
  if (!segments.length) return '';
  const base = (input.plot.h - input.plot.padB).toFixed(1);
  return segments
    .map((seg) => {
      const first = seg.split(' ').slice(1, 3);
      const lastX = seg.split(' ').at(-2)!;
      return `${seg} L ${lastX} ${base} L ${first[0]} ${base} Z`;
    })
    .join(' ');
}

/** Polilínea simple (contadores acumulados: sí interpolan, son monótonos). */
export function linePath(values: Array<number | null>, max: number, plot: Plot): string {
  const n = values.length;
  const parts: string[] = [];
  let pen = 'M';
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null) { pen = 'M'; continue; }
    parts.push(`${pen} ${xAt(i, n, plot).toFixed(1)} ${yAt(v, max, plot).toFixed(1)}`);
    pen = 'L';
  }
  return parts.join(' ');
}

const MONTH_LABELS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export interface AxisTick {
  x: number;
  label: string;
}

/**
 * Una marca por mes (o por año si la ventana es larga), ubicada en el primer
 * punto de ese mes. Se diezma hasta dejar como mucho `maxTicks` para que no
 * se pisen las etiquetas en "TODO".
 */
export function monthTicks(points: SupplyLevelPoint[], plot: Plot, maxTicks = 12): AxisTick[] {
  const n = points.length;
  const raw: AxisTick[] = [];
  let seen = '';
  for (let i = 0; i < n; i++) {
    const month = points[i].day.slice(0, 7);
    if (month === seen) continue;
    seen = month;
    const [y, m] = month.split('-');
    raw.push({ x: xAt(i, n, plot), label: `${MONTH_LABELS[Number(m) - 1]}${m === '01' ? ` ${y.slice(2)}` : ''}` });
  }
  const step = Math.ceil(raw.length / maxTicks);
  return step <= 1 ? raw : raw.filter((_, i) => i % step === 0);
}

/** Máximo "redondo" para el eje de contadores — evita el 38.993 como tope. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
