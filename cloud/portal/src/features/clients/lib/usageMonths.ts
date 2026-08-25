import type { UsageMonth } from '../../../shared/types/monitor';

export interface UsagePoint {
  /** Clave `YYYY-MM` — estable para casar con `month_date`, a diferencia de `month`
   * ("Mon YYYY" en inglés, según locale de Postgres). */
  key: string;
  /** Abreviatura de mes en español, mayúsculas (ENE/FEB/…) — para el eje del gráfico. */
  labelShort: string;
  total: number;
  isCurrent: boolean;
}

const MONTH_SHORT_ES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTH_LONG_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Rellena a 12 meses calendario (el actual + 11 anteriores) aunque `usage` (la
 * respuesta de `GET /clients/:id/usage`) sólo traiga filas para los meses con
 * lecturas reales — el backend no "rellena" huecos (ver docblock de
 * `USAGE_BY_MONTH_SQL`), y el handoff pide siempre 12 barras. Mes en español
 * calculado en JS a partir de `month_date` (ISO), no de `month` (depende del
 * locale de Postgres, no necesariamente español).
 */
export function padTo12Months(usage: UsageMonth[]): UsagePoint[] {
  const byKey = new Map(usage.map((m) => [monthKey(new Date(m.month_date)), m.mono + m.color]));
  const now = new Date();
  const points: UsagePoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    points.push({ key, labelShort: MONTH_SHORT_ES[d.getUTCMonth()], total: byKey.get(key) ?? 0, isCurrent: i === 0 });
  }
  return points;
}

/** Volumen del mes actual + variación % vs el mes anterior — usado tanto por la
 * tira de métricas como por la cifra grande de "Consumo mensual". `null` si no
 * hay mes anterior con volumen (evita un "+Infinity%"/división por cero). */
export function currentMonthDelta(usage: UsageMonth[]): { total: number; deltaPct: number | null; previousMonthLabel: string | null } {
  const points = padTo12Months(usage);
  const current = points[points.length - 1];
  const previous = points[points.length - 2];
  const deltaPct = previous && previous.total > 0 ? Math.round(((current.total - previous.total) / previous.total) * 1000) / 10 : null;
  const previousDate = previous ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)) : null;
  return {
    total: current?.total ?? 0,
    deltaPct,
    previousMonthLabel: previousDate ? MONTH_LONG_ES[previousDate.getUTCMonth()] : null,
  };
}
