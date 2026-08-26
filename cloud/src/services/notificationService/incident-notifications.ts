import { sendMail } from "./mailer";
import { postWebhook } from "./webhook";
import type { EmailAuditContext } from "./mailer";
import type { ResolvedContent } from "./types";

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
