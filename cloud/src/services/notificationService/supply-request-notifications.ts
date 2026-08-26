import { sendMail } from "./mailer";
import type { EmailAuditContext } from "./mailer";
import type { ResolvedContent } from "./types";

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
