/**
 * Envío real de notificaciones (email + webhook) para alertas críticas. Antes de
 * este trabajo no existía NINGUNA infraestructura de notificaciones — ni siquiera
 * código muerto: los `SMTP_*`/`ALERT_EMAIL_TO` de `.env.production.example`
 * estaban comentados y nunca se leían.
 *
 * Este módulo hace el envío en sí; quién decide CUÁNDO encolar un envío es
 * `alertService.openAlert` (sólo alertas nuevas — no en un hit de dedupe — y sólo
 * `severity==="critical"`), y quién lo dispara realmente es
 * `jobs/notificationWorker.ts` (un Worker de BullMQ separado, para no bloquear la
 * ingesta de lecturas ni arriesgar el lock de otros jobs con una espera de SMTP).
 */
export { sendMail } from "./mailer";
export type { EmailAuditContext, MailAttachment, SendMailOptions } from "./mailer";
export { postWebhook } from "./webhook";
export type { ResolvedContent } from "./types";
export { sendAlertEmail, sendAlertWebhook } from "./alert-notifications";
export type { AlertNotificationPayload } from "./alert-notifications";
export { sendReportEmail, sendReportWebhook } from "./report-notifications";
export type { ReportNotificationPayload } from "./report-notifications";
export { sendIncidentEmail, sendIncidentWebhook } from "./incident-notifications";
export type { IncidentNotificationPayload } from "./incident-notifications";
export { sendSupplyRequestEmail } from "./supply-request-notifications";
export type { SupplyRequestNotificationPayload } from "./supply-request-notifications";
