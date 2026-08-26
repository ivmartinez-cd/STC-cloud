import type { Knex } from "knex";
import type { RenderedTable } from "../../application/ports/report-renderer";
import { findLatestClosedPeriod, formatPeriod, type ReportClosureLine } from "../../../reports";

const COLUMNS = ["Serie", "Marca", "Modelo", "Primera lectura", "Última lectura",
  "Total inicial", "Total final", "Δ Total", "Δ Mono", "Δ Color", "Δ Estimado", "Reset de contador"];

function fmtDate(d: Date | string | null): string | null {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) : null;
}

function lineRow(l: ReportClosureLine): (string | number | null)[] {
  return [l.deviceSerial, l.deviceBrand, l.deviceModel, fmtDate(l.firstReadingAt), fmtDate(l.lastReadingAt),
    l.firstTotalPages, l.lastTotalPages, l.deltaTotal, l.deltaMono, l.deltaColor, l.deltaEstimated,
    l.hadCounterReset ? "Sí" : "No"];
}

/** "Cierre de facturación" programado — cierre de gap post-verificación del
 * handoff hifi #3 (26/08/2026): el mockup de Informes mostraba esta
 * plantilla sin `ReportType` real detrás (ver `report-templates.ts`).
 * Siempre el ÚLTIMO cierre OFICIAL (inmutable) del cliente, nunca un
 * cálculo en vivo — a diferencia de `usageTable`, que sí recalcula. Sin
 * cierres todavía → tabla vacía con las columnas, no un error (mismo
 * criterio que `consumableLevelsTable` con 0 ítems). */
export async function billingClosureTable(db: Knex, params: { title: string; clientId: string | null }): Promise<RenderedTable> {
  if (!params.clientId) throw new Error("El informe de cierre de facturación requiere un cliente");
  const result = await findLatestClosedPeriod(db, params.clientId);
  if (!result) return { title: params.title, columns: COLUMNS, rows: [], truncated: 0 };
  return {
    title: `${params.title} — ${formatPeriod(result.closure.period)}`,
    columns: COLUMNS,
    rows: result.lines.map(lineRow),
    truncated: 0,
  };
}
