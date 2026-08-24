import type { ReportClosure, ReportClosureLine } from "../../domain/entities/report-closure";
import { ClosureNotFoundError } from "../../domain/errors/report-error";
import type { ReportClosureRepository } from "../../domain/repositories/report-closure-repository";
import { buildClosureCsv, type ExportClosure, type ExportLine } from "../../domain/services/closure-csv";
import { formatPeriod } from "../../domain/services/period";
import type { ExportClosureInput, ExportedFile } from "../dtos/report-dtos";

/** Renderizador XLSX (exceljs) — puerto, la implementación vive en infraestructura. */
export interface ClosureXlsxRenderer {
  render(closure: ExportClosure, lines: ExportLine[]): Promise<Buffer>;
}

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function toExportClosure(c: ReportClosure): ExportClosure {
  return { period: c.period, status: c.status, closed_at: c.closedAt };
}

export function toExportLine(l: ReportClosureLine): ExportLine {
  return {
    device_serial: l.deviceSerial, device_model: l.deviceModel, device_brand: l.deviceBrand, agent_name: l.agentName,
    first_total_pages: l.firstTotalPages, first_reading_at: l.firstReadingAt,
    last_total_pages: l.lastTotalPages, last_reading_at: l.lastReadingAt,
    delta_total: l.deltaTotal, delta_mono: l.deltaMono, delta_color: l.deltaColor,
    source: l.source, had_counter_reset: l.hadCounterReset,
  };
}

/** `GET /clients/:id/reports/:closureId/export.{csv,xlsx}` — 404 si el cierre no es del cliente. */
export class ExportClosureUseCase {
  constructor(
    private readonly closures: ReportClosureRepository,
    private readonly xlsx: ClosureXlsxRenderer
  ) {}

  async execute(input: ExportClosureInput): Promise<ExportedFile> {
    const closure = await this.closures.findOwned(input.closureId, input.clientId);
    if (!closure) throw new ClosureNotFoundError();
    const lines = (await this.closures.findLines(closure.id)).map(toExportLine);
    const exportClosure = toExportClosure(closure);
    const base = `cierre_${formatPeriod(closure.period)}_${closure.id}`;
    if (input.format === "csv") {
      return { filename: `${base}.csv`, contentType: "text/csv; charset=utf-8", body: buildClosureCsv(exportClosure, lines) };
    }
    return { filename: `${base}.xlsx`, contentType: XLSX_CONTENT_TYPE, body: await this.xlsx.render(exportClosure, lines) };
  }
}
