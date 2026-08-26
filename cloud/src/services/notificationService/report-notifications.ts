import { sendMail } from "./mailer";
import { postWebhook } from "./webhook";
import type { EmailAuditContext, MailAttachment } from "./mailer";
import type { ResolvedContent } from "./types";

export interface ReportNotificationPayload {
  closureId: string;
  period: string;
  clientId: string;
  clientName: string;
  totalPages: number;
}

/** Email de un cierre mensual, con el CSV/XLSX adjuntos. */
export async function sendReportEmail(
  payload: ReportNotificationPayload,
  recipientEmail: string | null,
  attachments: MailAttachment[],
  content?: ResolvedContent,
  audit?: EmailAuditContext
): Promise<void> {
  await sendMail({
    audit,
    to: recipientEmail ?? undefined,
    bcc: process.env.ALERT_EMAIL_TO || undefined,
    subject: content?.subject ?? `[STC Cloud] Cierre mensual ${payload.period} — ${payload.clientName}`,
    text: content?.body ??
      `Cliente: ${payload.clientName}\n` +
      `Período: ${payload.period}\n` +
      `Total de páginas: ${payload.totalPages}\n\n` +
      `Se adjunta el detalle del cierre (CSV/XLSX).`,
    attachments,
  });
}

export async function sendReportWebhook(payload: ReportNotificationPayload, webhookUrl: string): Promise<void> {
  await postWebhook(webhookUrl, {
    event: "report.closed",
    report: { closure_id: payload.closureId, period: payload.period, total_pages: payload.totalPages },
    client: { id: payload.clientId, name: payload.clientName },
  });
}
