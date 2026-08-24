import ExcelJS from "exceljs";
import type { ClosureXlsxRenderer } from "../../application/use-cases/export-closure";
import {
  EXPORT_COLUMNS, exportHeaderLines, exportRowValues, type ExportClosure, type ExportLine,
} from "../../domain/services/closure-csv";
import { formatPeriod } from "../../domain/services/period";

/** Título de dos líneas + fila de encabezados en negrita con fondo gris. */
function addHeaderRows(sheet: ExcelJS.Worksheet, closure: ExportClosure) {
  const [title, closedLine] = exportHeaderLines(closure);
  sheet.addRow([title]);
  sheet.addRow([closedLine]);
  sheet.addRow([]);
  const headerRow = sheet.addRow([...EXPORT_COLUMNS]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });
}

/** Mismas columnas que el CSV, en un workbook real (encabezados en negrita, ancho ajustado). */
export async function buildClosureXlsx(closure: ExportClosure, lines: ExportLine[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "STC Cloud";
  workbook.created = new Date(closure.closed_at);

  const sheet = workbook.addWorksheet(`Cierre ${formatPeriod(new Date(closure.period))}`);
  addHeaderRows(sheet, closure);
  for (const l of lines) sheet.addRow(exportRowValues(l));
  sheet.columns.forEach((col) => { col.width = 18; });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export class ExcelJsClosureXlsxRenderer implements ClosureXlsxRenderer {
  render(closure: ExportClosure, lines: ExportLine[]): Promise<Buffer> {
    return buildClosureXlsx(closure, lines);
  }
}
