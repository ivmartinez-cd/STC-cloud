import { sendMail } from "./mailer";
import { postWebhook } from "./webhook";
import type { EmailAuditContext } from "./mailer";
import type { ResolvedContent } from "./types";

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
