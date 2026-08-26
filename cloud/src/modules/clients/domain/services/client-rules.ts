import type { ClientContactFields, ClientSettingsFields } from "../entities/client";
import { ClientValidationError } from "../errors/client-error";

/** Datos de alta — whitelist explícito de las columnas reales de `clients`, nunca el body completo (mass assignment). */
export function buildClientCreateData(body: ClientContactFields) {
  if (!body.name || !body.name.trim()) throw new ClientValidationError("El nombre del cliente es requerido");
  return {
    name: body.name.trim(),
    contact_name: body.contact_name?.trim() || null,
    contact_email: body.contact_email?.trim() || null,
    contact_phone: body.contact_phone?.trim() || null,
    address: body.address?.trim() || null,
    country: body.country?.trim() || null,
  };
}

export type ClientUpdateBody = ClientContactFields & ClientSettingsFields;

/**
 * Whitelist de edición. Sin fallback a `contact_email` para el canal de
 * notificación: si se manda explícitamente null/"", se limpia — nunca se
 * infiere de otro campo. `device_approval_required` (Fase 7) es opt-in y sólo
 * afecta a equipos descubiertos DESPUÉS de prenderlo.
 */
export function buildClientUpdates(body: ClientUpdateBody): Record<string, unknown> {
  if (body.name !== undefined && !body.name.trim()) {
    throw new ClientValidationError("El nombre del cliente no puede estar vacío");
  }
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name?.trim() || null;
  if (body.contact_email !== undefined) updates.contact_email = body.contact_email?.trim() || null;
  if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone?.trim() || null;
  if (body.address !== undefined) updates.address = body.address?.trim() || null;
  if (body.country !== undefined) updates.country = body.country?.trim() || null;
  if (body.notification_email !== undefined) updates.notification_email = body.notification_email?.trim() || null;
  if (body.notification_webhook_url !== undefined) updates.notification_webhook_url = body.notification_webhook_url?.trim() || null;
  if (body.notification_events !== undefined) updates.notification_events = JSON.stringify(body.notification_events);
  if (body.device_approval_required !== undefined) updates.device_approval_required = body.device_approval_required;
  return updates;
}

/**
 * Eventos que el portal puede suscribir en el webhook de la API pública
 * desde `/clients/:id/webhook` — debe reflejar TODOS los eventos que
 * `sendPublicApiWebhook` (`services/publicWebhookService.ts`) realmente
 * dispara (gemelo de `VALID_EVENTS` en `publicApiController.ts`, duplicado
 * porque domain no depende de infra). Quedó desactualizada tras sumar
 * incidentes/pedidos de consumibles: un cliente no podía suscribirse a esos
 * 4 eventos por ninguna de las dos vías aunque el sistema ya los mandaba.
 */
export const PORTAL_WEBHOOK_EVENTS = [
  "reading.created",
  "alert.created",
  "report.closed",
  "incident.created",
  "incident.closed",
  "supply_request.created",
  "supply_request.completed",
] as const;
export type PortalWebhookEvent = (typeof PORTAL_WEBHOOK_EVENTS)[number];

export function assertPortalWebhookEvents(events: string[] | undefined): asserts events is PortalWebhookEvent[] | undefined {
  if (events && !events.every((e) => (PORTAL_WEBHOOK_EVENTS as readonly string[]).includes(e))) {
    throw new ClientValidationError(`events debe ser subconjunto de ${PORTAL_WEBHOOK_EVENTS.join(", ")}`);
  }
}
