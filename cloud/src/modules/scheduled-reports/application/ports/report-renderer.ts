import type { ReportFormat, ReportType } from "../../domain/entities/scheduled-report";

/** Tabla ya resuelta, lista para codificar a CSV/XLSX. */
export interface RenderedTable {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  /** Si el renderer truncó resultados (tope defensivo), cuántas filas quedaron afuera. */
  truncated: number;
}

export interface RenderedFile {
  filename: string;
  contentType: string;
  content: Buffer;
}

/** Puerto: resuelve los datos de un tipo de informe y los codifica. */
export interface ReportRenderer {
  render(params: {
    reportType: ReportType;
    reportName: string;
    clientId: string | null;
    filters: Record<string, unknown>;
    format: ReportFormat;
  }): Promise<RenderedFile>;
}
