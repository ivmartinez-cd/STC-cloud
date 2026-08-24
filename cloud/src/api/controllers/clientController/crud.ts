import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getClientIp } from "../../utils/ip";

interface ClientBody {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  country: string;
}

async function createClient(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as Partial<ClientBody>;

  if (!body.name || !body.name.trim()) {
    return reply.status(400).send({ error: "El nombre del cliente es requerido" });
  }

  // Whitelist explícito de las columnas reales de `clients` — nunca insertar
  // el body completo (mass assignment).
  const data = {
    name: body.name.trim(),
    contact_name: body.contact_name?.trim() || null,
    contact_email: body.contact_email?.trim() || null,
    contact_phone: body.contact_phone?.trim() || null,
    address: body.address?.trim() || null,
    country: body.country?.trim() || null,
  };

  const [client] = await db("clients").insert(data).returning("*");
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  await db("audit_logs").insert({
    action: "CLIENT_CREATED",
    target_id: String(client.id),
    user_id: user?.userId ?? null,
    ip_address: getClientIp(request),
    metadata: JSON.stringify({ name: client.name }),
  });
  return client;
}

interface UpdateClientBody extends Partial<ClientBody> {
  notification_email?: string | null;
  notification_webhook_url?: string | null;
  notification_events?: string[];
  device_approval_required?: boolean;
}

function resolveClientUpdates(body: UpdateClientBody): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name?.trim() || null;
  if (body.contact_email !== undefined) updates.contact_email = body.contact_email?.trim() || null;
  if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone?.trim() || null;
  if (body.address !== undefined) updates.address = body.address?.trim() || null;
  if (body.country !== undefined) updates.country = body.country?.trim() || null;
  // Sin fallback a contact_email: si se manda explícitamente null/"", se limpia
  // el canal — nunca se infiere solo de otro campo.
  if (body.notification_email !== undefined) updates.notification_email = body.notification_email?.trim() || null;
  if (body.notification_webhook_url !== undefined) updates.notification_webhook_url = body.notification_webhook_url?.trim() || null;
  // Fase 4.3 del gap analysis vs HP SDS: opt-out de notificaciones por evento.
  if (body.notification_events !== undefined) updates.notification_events = JSON.stringify(body.notification_events);
  // Fase 7 del gap analysis vs HP SDS — opt-in, sólo afecta a equipos
  // descubiertos DESPUÉS de prenderlo (ver agentService.syncReadings/registerDevices).
  if (body.device_approval_required !== undefined) updates.device_approval_required = body.device_approval_required;
  return updates;
}

// No existía ningún endpoint para editar un cliente ya creado — hacía falta
// para poder configurar `notification_email`/`notification_webhook_url` desde
// el portal. Mismo criterio que `createClient`: whitelist explícito, nunca
// `request.body` completo (mass assignment).
async function updateClient(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as UpdateClientBody;

  const existing = await db("clients").where({ id }).first();
  if (!existing) return reply.status(404).send({ error: "Cliente no encontrado" });

  if (body.name !== undefined && !body.name.trim()) {
    return reply.status(400).send({ error: "El nombre del cliente no puede estar vacío" });
  }

  const updates = resolveClientUpdates(body);
  if (Object.keys(updates).length === 0) {
    return reply.status(400).send({ error: "Nada para actualizar" });
  }

  const [updated] = await db("clients").where({ id }).update(updates).returning("*");
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  await db("audit_logs").insert({
    action: "CLIENT_UPDATED",
    target_id: String(id),
    user_id: user?.userId ?? null,
    ip_address: getClientIp(request),
    metadata: JSON.stringify({ changes: Object.keys(updates) }),
  });
  return updated;
}

export function createClientCrudHandlers(db: Knex) {
  return {
    createClient: (request: FastifyRequest, reply: FastifyReply) => createClient(db, request, reply),
    updateClient: (request: FastifyRequest, reply: FastifyReply) => updateClient(db, request, reply),
  };
}
