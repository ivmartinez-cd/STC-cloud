import type { Knex } from "knex";
import type { PeriodUsageLine } from "./domain/entities/period-usage-line";
import type { ReportClosure, ReportClosureLine } from "./domain/entities/report-closure";
import { KnexPeriodUsageQuery } from "./infrastructure/database/knex-period-usage-query";
import { KnexReportClosureRepository } from "./infrastructure/database/knex-report-closure-repository";

/**
 * Fachada del módulo para los consumidores que viven fuera de él — mismas
 * firmas que tenían `services/reportService.ts` y `services/reportExportService.ts`,
 * así los call-sites sólo cambian el path del import:
 * - `jobs/reportDeliveryWorker.ts`: `formatPeriod`, `buildClosureCsv`, `buildClosureXlsx`
 *   (con filas crudas de la base, de ahí que `ExportLine`/`ExportClosure` sean snake_case).
 * - `modules/scheduled-reports` (renderer de tablas): `computePeriodUsage`, `parsePeriod`, `formatPeriod`.
 */
export { parsePeriod, formatPeriod } from "./domain/services/period";
export { buildClosureCsv, type ExportClosure, type ExportLine } from "./domain/services/closure-csv";
export { buildClosureXlsx } from "./infrastructure/export/closure-xlsx-renderer";
// PdfkitClosureRenderer.render en vez de la función suelta `buildClosurePdf`
// (a diferencia de CSV/XLSX de arriba): necesita el contrato de clase por
// `ClosurePdfRenderer` (puerto), no porque `reportDeliveryWorker.ts` use DI —
// se instancia directo, mismo criterio que el resto de este archivo.
export { PdfkitClosureRenderer } from "./infrastructure/export/closure-pdf-renderer";
export type { ExportClosurePdfContext } from "./application/use-cases/export-closure";
export type { PeriodUsageLine } from "./domain/entities/period-usage-line";
export type { ReportClosure, ReportClosureLine } from "./domain/entities/report-closure";
export { ClosurePeriodConflictError } from "./domain/errors/report-error";

export function computePeriodUsage(
  db: Knex | Knex.Transaction,
  params: { clientId: string; period: string }
): Promise<PeriodUsageLine[]> {
  return new KnexPeriodUsageQuery(db).compute(params.clientId, params.period);
}

/** Para el informe programado "Cierre de facturación" (`modules/scheduled-
 * reports`): el ÚLTIMO cierre oficial de un cliente + sus líneas, o `null`
 * si nunca cerró ninguno. */
export async function findLatestClosedPeriod(
  db: Knex | Knex.Transaction,
  clientId: string
): Promise<{ closure: ReportClosure; lines: ReportClosureLine[] } | null> {
  const repo = new KnexReportClosureRepository(db);
  const closure = await repo.findLatestClosed(clientId);
  if (!closure) return null;
  return { closure, lines: await repo.findLines(closure.id) };
}
