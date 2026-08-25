import type { PrintTrend, PrintTrendMonth } from "../entities/device-detail";

/**
 * Promedio/pico/proyección de la tendencia de 12 meses — puro, sin Postgres,
 * para poder testearlo sin DB. El handoff exige toda cifra derivada calculada
 * server-side (nunca en el componente), así que esto vive acá y no en el front.
 *
 * El promedio y la proyección se calculan sobre los meses COMPLETOS (se excluye
 * el corriente, que está a mitad de transcurrir y subestimaría el promedio real).
 * La proyección es un heurístico simple y documentado como tal: el promedio de
 * los últimos 3 meses completos (no una regresión) — 0 meses completos → `null`.
 */
export function summarizePrintTrend(months: PrintTrendMonth[]): PrintTrend {
  const complete = months.slice(0, -1); // último = mes corriente
  const avg = complete.length ? Math.round(complete.reduce((s, m) => s + m.total, 0) / complete.length) : 0;

  const peak = complete.reduce<{ month: string; total: number } | null>((best, m) => {
    if (m.total <= 0) return best;
    return !best || m.total > best.total ? { month: m.month, total: m.total } : best;
  }, null);

  const lastThree = complete.slice(-3);
  const projection = lastThree.length ? Math.round(lastThree.reduce((s, m) => s + m.total, 0) / lastThree.length) : null;

  return { months, monthly_avg: avg, peak, projection_next_month: projection };
}
