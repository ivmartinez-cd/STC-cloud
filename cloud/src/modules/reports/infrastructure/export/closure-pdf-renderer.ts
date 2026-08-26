import PDFDocument from "pdfkit";
import type { ClosurePdfRenderer, ExportClosurePdfContext } from "../../application/use-cases/export-closure";
import { type ExportLine } from "../../domain/services/closure-csv";
import { formatPeriod } from "../../domain/services/period";

/**
 * PDF "presentable" (Fase 19 del gap analysis) — portada con cliente/período/
 * totales + tabla de equipos, a diferencia del CSV/XLSX que son un volcado
 * de datos crudo. `pdfkit` en vez de Puppeteer+HTML: cero proceso de
 * navegador embebido — corre dentro del límite de memoria ya fijado para
 * `api` (512m/réplica, `docker-compose.prod.yml`), decisión explícita de
 * Ivan al scopear esta fase.
 *
 * Tabla dibujada a mano (pdfkit no trae layout de tablas) — filas fijas de
 * ancho conocido, undefined truncado a "—" mismo criterio que `closure-csv.ts`.
 */

const PAGE_MARGIN = 40;
const COLUMNS: { label: string; width: number; get: (l: ExportLine) => string }[] = [
  { label: "Serie", width: 90, get: (l) => l.device_serial ?? "S/N" },
  { label: "Modelo", width: 90, get: (l) => l.device_model ?? "N/A" },
  { label: "Marca", width: 60, get: (l) => l.device_brand ?? "N/A" },
  { label: "Monitor", width: 80, get: (l) => l.agent_name ?? "N/A" },
  { label: "Total", width: 55, get: (l) => String(l.delta_total) },
  { label: "Mono", width: 55, get: (l) => String(l.delta_mono) },
  { label: "Color", width: 55, get: (l) => String(l.delta_color) },
];

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number): number {
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1a2333");
  let cx = x;
  for (const col of COLUMNS) {
    doc.text(col.label, cx, y, { width: col.width, lineBreak: false });
    cx += col.width;
  }
  doc.moveTo(x, y + 14).lineTo(cx, y + 14).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
  return y + 18;
}

function drawTableRow(doc: PDFKit.PDFDocument, x: number, y: number, line: ExportLine): void {
  doc.font("Helvetica").fontSize(8).fillColor("#334155");
  let cx = x;
  for (const col of COLUMNS) {
    doc.text(col.get(line), cx, y, { width: col.width, lineBreak: false, ellipsis: true });
    cx += col.width;
  }
}

function buildClosurePdf(closure: ExportClosurePdfContext, lines: ExportLine[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const period = formatPeriod(new Date(closure.period));

    // ─── Portada ────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#1a2333").text("STC Cloud — Cierre mensual", { align: "left" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor("#64748b").text(closure.clientName);
    doc.moveDown(1.2);

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a2333").text(`Período: ${period}`);
    doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`Estado: ${closure.status === "closed" ? "Cerrado" : "Reabierto"}`);
    doc.text(`Cerrado: ${new Date(closure.closed_at).toLocaleString("es-AR", { timeZone: "UTC" })} UTC`);
    doc.moveDown(1);

    const totalsY = doc.y;
    const totalsBoxWidth = (doc.page.width - PAGE_MARGIN * 2) / 3;
    const totals: [string, number][] = [
      ["Total de páginas", closure.totalPages], ["Monocromo", closure.totalMono], ["Color", closure.totalColor],
    ];
    totals.forEach(([label, value], i) => {
      const bx = PAGE_MARGIN + i * totalsBoxWidth;
      doc.rect(bx, totalsY, totalsBoxWidth - 10, 46).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(label.toUpperCase(), bx + 10, totalsY + 8, { width: totalsBoxWidth - 30 });
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#1a2333").text(value.toLocaleString("es-AR"), bx + 10, totalsY + 20);
    });
    doc.y = totalsY + 60;
    doc.moveDown(1.5);

    // ─── Tabla de equipos ───────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#1a2333").text(`Detalle por equipo (${lines.length})`);
    doc.moveDown(0.5);

    let y = drawTableHeader(doc, PAGE_MARGIN, doc.y);
    const rowHeight = 14;
    const bottomLimit = doc.page.height - PAGE_MARGIN;
    for (const line of lines) {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawTableHeader(doc, PAGE_MARGIN, PAGE_MARGIN);
      }
      drawTableRow(doc, PAGE_MARGIN, y, line);
      y += rowHeight;
    }

    doc.end();
  });
}

export class PdfkitClosureRenderer implements ClosurePdfRenderer {
  render(closure: ExportClosurePdfContext, lines: ExportLine[]): Promise<Buffer> {
    return buildClosurePdf(closure, lines);
  }
}
