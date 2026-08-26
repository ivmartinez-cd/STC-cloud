import { formatPeriod } from "./period";

/**
 * Forma mínima compartida entre CSV/XLSX — mismas columnas que
 * `report_closure_lines`, en snake_case a propósito: la consumen tanto el
 * caso de uso de exportación (vía `toExportLine`) como
 * `jobs/reportDeliveryWorker.ts`, que le pasa filas crudas de la base.
 */
export interface ExportLine {
  device_serial: string | null;
  device_model: string | null;
  device_brand: string | null;
  agent_name: string | null;
  first_total_pages: number | null;
  first_reading_at: string | Date | null;
  last_total_pages: number | null;
  last_reading_at: string | Date | null;
  delta_total: number;
  delta_mono: number;
  delta_color: number;
  delta_other: number;
  delta_estimated: number | null;
  source: string | null;
  had_counter_reset: boolean;
}

export interface ExportClosure {
  period: Date | string;
  status: string;
  closed_at: Date | string;
}

export const EXPORT_COLUMNS = [
  "SERIE", "MODELO", "MARCA", "MONITOR",
  "LECTURA_INICIAL", "FECHA_INICIAL", "LECTURA_FINAL", "FECHA_FINAL",
  "DELTA_TOTAL", "DELTA_MONO", "DELTA_COLOR", "DELTA_OTRO", "DELTA_ESTIMADO",
  "FUENTE", "RESET_CONTADOR",
] as const;

export function exportRowValues(l: ExportLine): (string | number)[] {
  return [
    l.device_serial ?? "S/N",
    l.device_model ?? "N/A",
    l.device_brand ?? "N/A",
    l.agent_name ?? "N/A",
    l.first_total_pages ?? "N/A",
    l.first_reading_at ? new Date(l.first_reading_at).toISOString() : "N/A",
    l.last_total_pages ?? "N/A",
    l.last_reading_at ? new Date(l.last_reading_at).toISOString() : "N/A",
    l.delta_total,
    l.delta_mono,
    l.delta_color,
    l.delta_other,
    l.delta_estimated ?? "N/A",
    l.source ?? "N/A",
    l.had_counter_reset ? "SI" : "NO",
  ];
}

/** Encabezado de dos líneas compartido por CSV y XLSX. */
export function exportHeaderLines(closure: ExportClosure): [string, string] {
  const period = formatPeriod(new Date(closure.period));
  return [
    `CIERRE MENSUAL — Período: ${period} — Estado: ${closure.status}`,
    `Cerrado: ${new Date(closure.closed_at).toISOString()}`,
  ];
}

/** Layout histórico del CSV — separador `;`, CRLF, BOM UTF-8. Puro. */
export function buildClosureCsv(closure: ExportClosure, lines: ExportLine[]): string {
  const rows = [
    ...exportHeaderLines(closure),
    "",
    EXPORT_COLUMNS.join(";"),
    ...lines.map((l) => exportRowValues(l).join(";")),
  ];
  return "﻿" + rows.join("\r\n");
}
