import dns from "dns";
import net from "net";
import nodemailer from "nodemailer";

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

/**
 * Manda el email de una alerta crítica a `notification_email` (si el cliente lo
 * configuró) y en BCC a `ALERT_EMAIL_TO` (si está seteado — cierra ese env var
 * documentado-pero-muerto). No-opea silenciosamente si no hay transporte SMTP
 * configurado ni destinatarios: mejor "no se mandó nada" que reventar el worker.
 */
export async function sendAlertEmail(
  payload: AlertNotificationPayload,
  recipientEmail: string | null
): Promise<void> {
  const to = recipientEmail;
  const bcc = process.env.ALERT_EMAIL_TO || undefined;
  if (!to && !bcc) return;

  const mailer = getTransporter();
  if (!mailer) return;

  const subject = `[STC Cloud] Alerta crítica — ${payload.clientName}`;
  const target = payload.deviceName || payload.agentName || "—";
  const text =
    `Cliente: ${payload.clientName}\n` +
    `Origen: ${target}\n` +
    `Tipo: ${payload.type}\n` +
    `Mensaje: ${payload.message}\n`;

  await mailer.sendMail({
    from: process.env.SMTP_FROM || "STC Cloud <notificaciones@stc-cloud.local>",
    to: to || bcc, // nodemailer requiere al menos un destinatario en "to"
    bcc: to ? bcc : undefined,
    subject,
    text,
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
 * POST del payload de la alerta al webhook del cliente. Un solo intento (BullMQ ya
 * da reintento/backoff a nivel de job — ver `notificationWorker.ts`), timeout
 * corto, sin seguir redirects (una 3xx a una URL privada burlaría el guard de
 * arriba si se siguiera automáticamente).
 */
export async function sendAlertWebhook(payload: AlertNotificationPayload, webhookUrl: string): Promise<void> {
  const url = await assertSafeWebhookUrl(webhookUrl);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
}
