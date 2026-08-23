import crypto from "crypto";
import { Knex } from "knex";
import { postWebhook } from "./notificationService";

/**
 * Webhooks de integración ERP de la API pública — distintos de los webhooks
 * de notificación interna ya existentes (`clients.notification_webhook_url`,
 * usados para alertas/cierres del propio cliente). Una fila por cliente
 * (`api_webhooks`, no por API key) para que rotar una key no rompa la
 * suscripción ya configurada.
 */
export type PublicApiEvent = "reading.created" | "alert.created" | "report.closed";

export interface WebhookConfig {
  url: string;
  events: PublicApiEvent[];
  secret: string;
  active: boolean;
}

export async function getWebhookConfig(db: Knex, clientId: string): Promise<WebhookConfig | null> {
  const row = await db("api_webhooks").where({ client_id: clientId }).first();
  if (!row) return null;
  return { url: row.url, events: row.events, secret: row.secret, active: row.active };
}

/**
 * Crea o actualiza la config. El `secret` HMAC, a diferencia del API key, no
 * necesita mostrarse una sola vez — sólo sirve para que el ERP VERIFIQUE
 * firmas que STC manda, no da acceso a nada — así que puede regenerarse o
 * volver a leerse en cualquier momento vía este mismo endpoint.
 */
export async function upsertWebhookConfig(
  db: Knex,
  clientId: string,
  patch: { url?: string; events?: PublicApiEvent[]; regenerateSecret?: boolean; active?: boolean }
): Promise<WebhookConfig> {
  const existing = await db("api_webhooks").where({ client_id: clientId }).first();
  const secret =
    patch.regenerateSecret || !existing ? crypto.randomBytes(32).toString("hex") : existing.secret;

  const row = {
    client_id: clientId,
    url: patch.url ?? existing?.url,
    events: JSON.stringify(patch.events ?? existing?.events ?? ["reading.created", "alert.created", "report.closed"]),
    secret,
    active: patch.active ?? existing?.active ?? true,
  };
  if (!row.url) throw new Error("url es requerida para configurar el webhook");

  await db("api_webhooks").insert(row).onConflict("client_id").merge();
  return { url: row.url, events: JSON.parse(row.events), secret: row.secret, active: row.active };
}

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * No-op silencioso si el cliente no tiene webhook activo o no está suscrito
 * a este evento — el caller no necesita chequear existencia antes de llamar.
 */
export async function sendPublicApiWebhook(
  db: Knex,
  clientId: string,
  event: PublicApiEvent,
  data: unknown
): Promise<void> {
  const config = await getWebhookConfig(db, clientId);
  if (!config || !config.active || !config.events.includes(event)) return;

  const payload = { event, data, timestamp: new Date().toISOString() };
  // La firma se calcula sobre el MISMO objeto que `postWebhook` va a
  // serializar — `JSON.stringify` es determinístico sobre el mismo valor
  // (mismo orden de inserción de claves), así que el string firmado acá
  // coincide byte a byte con el body que el ERP recibe.
  const signature = signPayload(config.secret, JSON.stringify(payload));
  await postWebhook(config.url, payload, { "X-STC-Signature": signature });
}
