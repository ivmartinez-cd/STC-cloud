import { InvalidPeriodError } from "../errors/report-error";
import type { ClosureTotals } from "../entities/report-closure";
import type { PeriodUsageLine } from "../entities/period-usage-line";

/** Parsea "YYYY-MM" a los límites [inicio, fin) del mes calendario, en UTC. */
export function parsePeriod(period: string): { periodStart: Date; periodEnd: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new InvalidPeriodError();
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  if (month < 1 || month > 12) throw new InvalidPeriodError();
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  return { periodStart, periodEnd };
}

/** "YYYY-MM" a partir de un `period` (columna `date`, primer día del mes). */
export function formatPeriod(periodDate: Date): string {
  const d = new Date(periodDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** El total OFICIAL de una línea al momento del cierre: la estimación
 * cuando hubo reset de contador y se pudo calcular (mismo criterio que
 * `displayDelta` del portal para la vista previa), el delta crudo si no.
 * Decisión de producto post-verificación del handoff hifi #3 (26/08/2026):
 * antes la estimación era sólo informativa y nunca entraba a lo facturado;
 * ahora se aplica sola al cerrar — un reset de contador ya no le hace
 * perder al cliente las páginas realmente impresas en esa ventana. */
function effectiveDeltaTotal(l: PeriodUsageLine): number {
  const total = Number(l.delta_total);
  return l.had_counter_reset && l.delta_estimated != null && l.delta_estimated > 0 ? Number(l.delta_estimated) : total;
}

/** Totales del cierre = suma de los deltas por dispositivo (ya son deltas
 * positivos), con la estimación aplicada donde corresponda vía
 * `effectiveDeltaTotal`. `totalOther` absorbe esa misma diferencia
 * (`efectivo - crudo`) además del residuo que ya traía la línea, así la
 * igualdad `totalPages = totalMono + totalColor + totalOther` se mantiene
 * siempre — nunca se recalcula como resta al final, se arrastra por línea
 * para que valga incluso si el cierre se recompone línea por línea en otro
 * contexto (ej. un futuro re-render parcial). Los campos crudos por línea
 * (`delta_total`, etc.) no se tocan — quedan intactos para auditoría. */
export function sumUsageTotals(lines: PeriodUsageLine[]): ClosureTotals {
  return lines.reduce(
    (acc, l) => {
      const effTotal = effectiveDeltaTotal(l);
      const effOther = Number(l.delta_other) + (effTotal - Number(l.delta_total));
      return {
        totalPages: acc.totalPages + effTotal,
        totalMono: acc.totalMono + Number(l.delta_mono),
        totalColor: acc.totalColor + Number(l.delta_color),
        totalOther: acc.totalOther + effOther,
      };
    },
    { totalPages: 0, totalMono: 0, totalColor: 0, totalOther: 0 }
  );
}

/** Cifras del header que hoy sólo existen por línea (`had_counter_reset`) y
 * nunca se totalizan — se congelan al cerrar, igual criterio que el resto. */
export function closureMeta(lines: PeriodUsageLine[]): { deviceCount: number; anomaliesCount: number } {
  return { deviceCount: lines.length, anomaliesCount: lines.filter((l) => l.had_counter_reset).length };
}
