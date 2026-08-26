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

/** Totales del cierre = suma de los deltas por dispositivo (ya son deltas
 * positivos). `totalOther` se suma tal cual viene de cada línea — nunca se
 * recalcula como `totalPages - totalMono - totalColor` acá (aunque da lo
 * mismo matemáticamente): sumar el residuo POR LÍNEA es lo que garantiza
 * que la igualdad valga incluso si el cierre se recompone línea por línea
 * en otro contexto (ej. un futuro re-render parcial). */
export function sumUsageTotals(lines: PeriodUsageLine[]): ClosureTotals {
  return lines.reduce(
    (acc, l) => ({
      totalPages: acc.totalPages + Number(l.delta_total),
      totalMono: acc.totalMono + Number(l.delta_mono),
      totalColor: acc.totalColor + Number(l.delta_color),
      totalOther: acc.totalOther + Number(l.delta_other),
    }),
    { totalPages: 0, totalMono: 0, totalColor: 0, totalOther: 0 }
  );
}

/** Cifras del header que hoy sólo existen por línea (`had_counter_reset`) y
 * nunca se totalizan — se congelan al cerrar, igual criterio que el resto. */
export function closureMeta(lines: PeriodUsageLine[]): { deviceCount: number; anomaliesCount: number } {
  return { deviceCount: lines.length, anomaliesCount: lines.filter((l) => l.had_counter_reset).length };
}
