import ExcelJS from "exceljs";
import type { RenderedFile, RenderedTable } from "../../application/ports/report-renderer";
import type { ReportFormat } from "../../domain/entities/scheduled-report";

/**
 * Codificador genérico tabla → CSV/XLSX. Mismo estilo de salida que
 * `services/reportExportService.ts` (BOM UTF-8 para Excel en el CSV,
 * cabecera en negrita en el XLSX), pero sobre una tabla arbitraria.
 */

function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(table: RenderedTable): Buffer {
  const lines = [table.columns.map(csvCell).join(",")];
  for (const row of table.rows) lines.push(row.map(csvCell).join(","));
  return Buffer.from("﻿" + lines.join("\n"), "utf8");
}

async function toXlsx(table: RenderedTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "STC Cloud";
  const sheet = workbook.addWorksheet(table.title.slice(0, 31) || "Informe");
  const headerRow = sheet.addRow([...table.columns]);
  headerRow.font = { bold: true };
  for (const row of table.rows) sheet.addRow(row);
  sheet.columns.forEach((col) => {
    col.width = 20;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function safeFilename(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
}

export async function encodeTable(table: RenderedTable, format: ReportFormat): Promise<RenderedFile> {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${safeFilename(table.title)}_${date}`;
  if (format === "csv") {
    return { filename: `${base}.csv`, contentType: "text/csv; charset=utf-8", content: toCsv(table) };
  }
  return {
    filename: `${base}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: await toXlsx(table),
  };
}
