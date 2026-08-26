import nodemailer from "nodemailer";
import type { Knex } from "knex";
import { recordEmailAttempt } from "../../modules/email-log";

/** Contexto de auditoría que los workers adjuntan al enviar (Fase 4.4). */
export interface EmailAuditContext {
  db: Knex;
  clientId: string | null;
  event: string;
  metadata?: Record<string, unknown>;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let transporterInitialized = false;

/**
 * `null` si `SMTP_HOST` no está seteado — el envío de mail queda "opcional" de
 * verdad, en vez de fallar en cada intento cuando no hay relay configurado.
 */
function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (transporterInitialized) return transporter;
  transporterInitialized = true;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendMailOptions {
  to?: string;
  bcc?: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
  /** Contexto de auditoría de correo (Fase 4.4): si viene, cada intento —
   * incluso los no enviados — deja una fila en `email_log` (best-effort). */
  audit?: EmailAuditContext;
}

async function auditAttempt(
  opts: SendMailOptions,
  status: "sent" | "error" | "skipped_no_transport" | "skipped_no_recipient",
  error?: string
): Promise<void> {
  if (!opts.audit) return;
  await recordEmailAttempt(opts.audit.db, {
    clientId: opts.audit.clientId,
    event: opts.audit.event,
    recipient: opts.to ?? null,
    subject: opts.subject,
    status,
    error: error ?? null,
    metadata: opts.audit.metadata ?? null,
  });
}

/**
 * Envío de mail genérico — reusado por `sendAlertEmail` (alertas) y
 * `sendReportEmail` (cierres, con adjuntos). No-opea silenciosamente si no hay
 * transporte SMTP configurado ni destinatarios: mejor "no se mandó nada" que
 * reventar el worker que lo llama. Con `opts.audit`, cada intento (enviado,
 * fallado o salteado) queda registrado en `email_log` (Fase 4.4).
 */
export async function sendMail(opts: SendMailOptions): Promise<void> {
  if (!opts.to && !opts.bcc) {
    await auditAttempt(opts, "skipped_no_recipient");
    return;
  }
  const mailer = getTransporter();
  if (!mailer) {
    await auditAttempt(opts, "skipped_no_transport");
    return;
  }
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || "STC Cloud <notificaciones@stc-cloud.local>",
      to: opts.to || opts.bcc, // nodemailer requiere al menos un destinatario en "to"
      bcc: opts.to ? opts.bcc : undefined,
      subject: opts.subject,
      text: opts.text,
      attachments: opts.attachments,
    });
    await auditAttempt(opts, "sent");
  } catch (err) {
    await auditAttempt(opts, "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
