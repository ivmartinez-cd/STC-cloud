import ExcelJS from "exceljs";
import { formatPeriod } from "./reportService";

/** Forma mínima compartida entre CSV/XLSX — misma columnas que `report_closure_lines`. */
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
  source: string | null;
  had_counter_reset: boolean;
}

export interface ExportClosure {
  period: Date | string;
  status: string;
  closed_at: Date | string;
}

const COLUMNS = [
  "SERIE", "MODELO", "MARCA", "MONITOR",
  "LECTURA_INICIAL", "FECHA_INICIAL", "LECTURA_FINAL", "FECHA_FINAL",
  "DELTA_TOTAL", "DELTA_MONO", "DELTA_COLOR", "FUENTE", "RESET_CONTADOR",
] as const;

function rowValues(l: ExportLine): (string | number)[] {
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
    l.source ?? "N/A",
    l.had_counter_reset ? "SI" : "NO",
  ];
}

/** Mismo layout que ya usa `reportController.exportCsv` — separador `;`, CRLF, BOM UTF-8. */
export function buildClosureCsv(closure: ExportClosure, lines: ExportLine[]): string {
  const period = formatPeriod(new Date(closure.period));
  const rows = [
    `CIERRE MENSUAL — Período: ${period} — Estado: ${closure.status}`,
    `Cerrado: ${new Date(closure.closed_at).toISOString()}`,
    "",
    COLUMNS.join(";"),
    ...lines.map((l) => rowValues(l).join(";")),
  ];
  return "﻿" + rows.join("\r\n");
}

/** Mismas columnas que el CSV, en un workbook real (encabezados en negrita, ancho ajustado). */
export async function buildClosureXlsx(closure: ExportClosure, lines: ExportLine[]): Promise<Buffer> {
  const period = formatPeriod(new Date(closure.period));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "STC Cloud";
  workbook.created = new Date(closure.closed_at);

  const sheet = workbook.addWorksheet(`Cierre ${period}`);
  sheet.addRow([`CIERRE MENSUAL — Período: ${period} — Estado: ${closure.status}`]);
  sheet.addRow([`Cerrado: ${new Date(closure.closed_at).toISOString()}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([...COLUMNS]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });

  for (const l of lines) {
    sheet.addRow(rowValues(l));
  }

  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
