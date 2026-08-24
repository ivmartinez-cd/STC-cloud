import type { RenderedFile } from "./report-renderer";

/** Puerto de salida: envío del informe generado a los destinatarios. */
export interface ReportMailer {
  send(params: {
    recipients: string[];
    reportName: string;
    bodyText: string;
    file: RenderedFile;
  }): Promise<void>;
}
