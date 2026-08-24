import type { Knex } from "knex";
import { sendMail } from "../../../../services/notificationService";
import type { ReportMailer } from "../../application/ports/report-mailer";
import type { RenderedFile } from "../../application/ports/report-renderer";

/**
 * Adaptador sobre el transporte SMTP existente (`notificationService.sendMail`,
 * que ya resuelve el caso "sin SMTP_HOST configurado" no enviando en silencio).
 * Un informe sin destinatarios directamente no llama al transporte.
 */
export class SmtpReportMailer implements ReportMailer {
  /** `db` opcional: con él, cada envío queda en `email_log` (Fase 4.4). */
  constructor(private readonly db?: Knex) {}

  async send(params: {
    recipients: string[];
    reportName: string;
    bodyText: string;
    file: RenderedFile;
  }): Promise<void> {
    if (params.recipients.length === 0) return;
    await sendMail({
      audit: this.db
        ? { db: this.db, clientId: null, event: "scheduled_report", metadata: { report_name: params.reportName } }
        : undefined,
      to: params.recipients.join(", "),
      subject: `[STC Cloud] Informe: ${params.reportName}`,
      text: params.bodyText,
      attachments: [
        {
          filename: params.file.filename,
          content: params.file.content,
          contentType: params.file.contentType,
        },
      ],
    });
  }
}
