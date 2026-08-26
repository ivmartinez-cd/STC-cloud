import nodemailer from "nodemailer";
import type { Knex } from "knex";
import { recordEmailAttempt } from "../../modules/email-log";
import { readSmtpPasswordPlaintext, readSystemSettings } from "../../modules/system-settings";

/** Contexto de auditoría que los workers adjuntan al enviar (Fase 4.4). */
export interface EmailAuditContext {
  db: Knex;
  clientId: string | null;
  event: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

const SETTINGS_TTL_MS = 60_000;
let cachedConfig: { value: ResolvedSmtpConfig | null; fetchedAt: number } | null = null;

function fromEnv(): ResolvedSmtpConfig | null {
  if (!process.env.SMTP_HOST) return null;
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || "STC Cloud <notificaciones@stc-cloud.local>",
  };
}

/**
 * `system_settings` (handoff hifi #3, fase 2, 26/08/2026) gana sobre las env
 * vars cuando `smtp_host` está seteado en base — así el admin puede
 * configurar SMTP desde Configuración sin redeploy. Sin fila en base o sin
 * `smtp_host`, cae a env (comportamiento histórico, no rompe despliegues que
 * ya lo tenían por env). Cacheado 60s — igual criterio que `/audit-logs/actions`.
 */
export async function resolveSmtpConfig(db: Knex | undefined): Promise<ResolvedSmtpConfig | null> {
  if (!db) return fromEnv();
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < SETTINGS_TTL_MS) return cachedConfig.value;
  const settings = await readSystemSettings(db);
  const value = settings.smtpHost
    ? {
        host: settings.smtpHost, port: settings.smtpPort ?? 587, secure: settings.smtpEncryption === "tls",
        user: settings.smtpUser ?? undefined, password: (await readSmtpPasswordPlaintext(db)) ?? undefined,
        from: settings.smtpFrom || "STC Cloud <notificaciones@stc-cloud.local>",
      }
    : fromEnv();
  cachedConfig = { value, fetchedAt: Date.now() };
  return value;
}

/** Sólo para tests: fuerza a re-resolver la próxima vez (los settings pueden cambiar entre tests). */
export function _resetSmtpConfigCacheForTests(): void {
  cachedConfig = null;
}

export function buildTransporter(config: ResolvedSmtpConfig): ReturnType<typeof nodemailer.createTransport> {
  return nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });
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
   * incluso los no enviados — deja una fila en `email_log` (best-effort). También
   * es la fuente del `db` para resolver SMTP desde `system_settings`. */
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
  const config = await resolveSmtpConfig(opts.audit?.db);
  if (!config) {
    await auditAttempt(opts, "skipped_no_transport");
    return;
  }
  try {
    await buildTransporter(config).sendMail({
      from: config.from,
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
