import dns from "dns";
import net from "net";
import nodemailer from "nodemailer";
import type { Knex } from "knex";
import { recordEmailAttempt } from "../modules/email-log";

/** Contexto de auditoría que los workers adjuntan al enviar (Fase 4.4). */
export interface EmailAuditContext {
  db: Knex;
  clientId: string | null;
  event: string;
  metadata?: Record<string, unknown>;
}

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

export interface AlertNotificationPayload {
  alertId: number;
  type: string;
  severity: string;
  message: string;
  deviceName?: string | null;
  agentName?: string | null;
  clientId: string;
  clientName: string;
}

/** Subject+body ya resueltos por el módulo de plantillas (Fase 4.3). Si un
 * sender no lo recibe, arma el texto hardcodeado histórico. */
export interface ResolvedContent {
  subject: string;
  body: string;
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

/**
 * Manda el email de una alerta crítica a `notification_email` (si el cliente lo
 * configuró) y en BCC a `ALERT_EMAIL_TO` (si está seteado — cierra ese env var
 * documentado-pero-muerto). Wrapper delgado sobre `sendMail` — comportamiento
 * sin cambios respecto de antes del refactor.
 */
export async function sendAlertEmail(
  payload: AlertNotificationPayload,
  recipientEmail: string | null,
  content?: ResolvedContent,
  audit?: EmailAuditContext
): Promise<void> {
  const target = payload.deviceName || payload.agentName || "—";
  await sendMail({
    audit,
    to: recipientEmail ?? undefined,
    bcc: process.env.ALERT_EMAIL_TO || undefined,
    subject: content?.subject ?? `[STC Cloud] Alerta crítica — ${payload.clientName}`,
    text: content?.body ?? (
      `Cliente: ${payload.clientName}\n` +
      `Origen: ${target}\n` +
      `Tipo: ${payload.type}\n` +
      `Mensaje: ${payload.message}\n`),
  });
}

/** Rangos privados/loopback/link-local IPv4 relevantes para el guard SSRF de abajo. */
function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // formato raro → rechazar
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local — incluye 169.254.169.254 (metadata de nube)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateOrLoopbackIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrLoopbackIPv4(mapped[1]);
  return false;
}

/**
 * Guard SSRF: la URL del webhook la carga el operador vía `PUT /clients/:id` y el
 * SERVIDOR hace la petición saliente — misma superficie que ya se trató en
 * "Seguridad mínima" (mass assignment de `createClient`). Sólo `https:`, y se
 * resuelve el hostname para rechazar loopback/privado/link-local ANTES de
 * conectar (no alcanza con mirar el hostname literal: un atacante puede apuntar
 * un dominio propio a `169.254.169.254`).
 */
async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL de webhook inválida");
  }
  if (url.protocol !== "https:") {
    throw new Error("El webhook debe ser https");
  }

  // `URL.hostname` conserva los corchetes para un literal IPv6 (`"[::1]"`) —
  // `net.isIP()` no los reconoce con corchetes y el hostname caía al branch de
  // DNS, donde una resolución de "[::1]" como si fuera un nombre de dominio
  // fallaba con ENOTFOUND en vez de ser rechazado como loopback.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    const unsafe = net.isIP(hostname) === 6 ? isPrivateOrLoopbackIPv6(hostname) : isPrivateOrLoopbackIPv4(hostname);
    if (unsafe) throw new Error("El webhook apunta a una dirección de red interna");
    return url;
  }

  const resolved = await dns.promises.lookup(hostname, { all: true });
  for (const { address, family } of resolved) {
    const unsafe = family === 6 ? isPrivateOrLoopbackIPv6(address) : isPrivateOrLoopbackIPv4(address);
    if (unsafe) throw new Error(`El webhook resuelve a una dirección de red interna (${address})`);
  }
  return url;
}

/**
 * POST genérico contra un webhook — reusado por alertas y cierres. Un solo
 * intento (BullMQ ya da reintento/backoff a nivel de job), timeout corto, sin
 * seguir redirects (una 3xx a una URL privada burlaría el guard SSRF si se
 * siguiera automáticamente).
 */
export async function postWebhook(
  webhookUrl: string,
  body: unknown,
  extraHeaders?: Record<string, string>
): Promise<void> {
  const url = await assertSafeWebhookUrl(webhookUrl);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
}

/** Wrapper delgado sobre `postWebhook` — comportamiento sin cambios respecto de antes del refactor. */
export async function sendAlertWebhook(payload: AlertNotificationPayload, webhookUrl: string): Promise<void> {
  await postWebhook(webhookUrl, {
    event: "alert.created",
    alert: {
      id: payload.alertId,
      type: payload.type,
      severity: payload.severity,
      message: payload.message,
      device_name: payload.deviceName ?? null,
      agent_name: payload.agentName ?? null,
    },
    client: { id: payload.clientId, name: payload.clientName },
  });
}

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

// Fase 11 del gap analysis vs HP SDS — módulo de incidentes.
export interface IncidentNotificationPayload {
  incidentId: string;
  number: number;
  klass: string;
  title: string;
  severity: string;
  clientId: string;
  clientName: string;
  deviceLabel: string | null;
}

export async function sendIncidentEmail(
  payload: IncidentNotificationPayload,
  recipientEmail: string | null,
  content?: ResolvedContent,
  audit?: EmailAuditContext
): Promise<void> {
  await sendMail({
    audit,
    to: recipientEmail ?? undefined,
    bcc: process.env.ALERT_EMAIL_TO || undefined,
    subject: content?.subject ?? `[STC Cloud] Incidente #${payload.number} — ${payload.clientName}`,
    text: content?.body ??
      `Cliente: ${payload.clientName}\n` +
      `Equipo: ${payload.deviceLabel ?? "—"}\n` +
      `Clase: ${payload.klass}\n` +
      `Severidad: ${payload.severity}\n` +
      `Título: ${payload.title}\n`,
  });
}

export async function sendIncidentWebhook(payload: IncidentNotificationPayload, webhookUrl: string): Promise<void> {
  await postWebhook(webhookUrl, {
    event: "incident.created",
    incident: { id: payload.incidentId, number: payload.number, class: payload.klass, title: payload.title, severity: payload.severity },
    client: { id: payload.clientId, name: payload.clientName },
  });
}

// ─── Pedidos de consumibles (Fase 4.2 del gap analysis vs HP SDS) ───────────

export interface SupplyRequestNotificationPayload {
  requestId: string;
  clientName: string;
  deviceSerial: string | null;
  supplyKind: string;
  supplyColor: string | null;
  description: string | null;
  levelPct: number | null;
  completed: boolean;
}

export async function sendSupplyRequestEmail(
  payload: SupplyRequestNotificationPayload,
  recipientEmail: string | null,
  content?: ResolvedContent,
  audit?: EmailAuditContext
): Promise<void> {
  const verb = payload.completed ? "completado (consumible reemplazado)" : "generado";
  await sendMail({
    audit,
    to: recipientEmail ?? undefined,
    bcc: process.env.ALERT_EMAIL_TO || undefined,
    subject: content?.subject ?? `[STC Cloud] Pedido de consumible ${payload.completed ? "completado" : "nuevo"} — ${payload.clientName}`,
    text: content?.body ??
      `Se ha ${verb} un pedido de consumible.\n\n` +
      `Cliente: ${payload.clientName}\n` +
      `Equipo: ${payload.deviceSerial ?? "—"}\n` +
      `Consumible: ${payload.description ?? `${payload.supplyKind} ${payload.supplyColor ?? ""}`}\n` +
      `Nivel al abrir: ${payload.levelPct != null ? `${payload.levelPct}%` : "—"}\n`,
  });
}
