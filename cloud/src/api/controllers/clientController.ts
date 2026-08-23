import { FastifyRequest, FastifyReply } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";
import { getScope } from "../utils/scope";
import { onlyLiveDevices, notMerged } from "../utils/deviceFilters";
import * as apiKeyService from "../../services/apiKeyService";

export function createClientController(db: Knex) {
  return {
    createClient: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Partial<{
        name: string;
        contact_name: string;
        contact_email: string;
        contact_phone: string;
        address: string;
        country: string;
      }>;

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
    },

    // No existía ningún endpoint para editar un cliente ya creado — hacía falta
    // para poder configurar `notification_email`/`notification_webhook_url` desde
    // el portal. Mismo criterio que `createClient`: whitelist explícito, nunca
    // `request.body` completo (mass assignment).
    updateClient: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        name: string;
        contact_name: string;
        contact_email: string;
        contact_phone: string;
        address: string;
        country: string;
        notification_email: string | null;
        notification_webhook_url: string | null;
      }>;

      const existing = await db("clients").where({ id }).first();
      if (!existing) return reply.status(404).send({ error: "Cliente no encontrado" });

      if (body.name !== undefined && !body.name.trim()) {
        return reply.status(400).send({ error: "El nombre del cliente no puede estar vacío" });
      }

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
    },

    listClients: async (request: FastifyRequest) => {
      const scope = getScope(request);
      return await db("clients")
        .modify((q) => {
          if (scope.kind === "client") q.where("clients.id", scope.id);
        })
        .select(
          "clients.*",
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"
          ),
          db.raw(
            "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count"
          ),
          db.raw(
            "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count"
          ),
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"
          )
        )
        .leftJoin("agents as a", "a.client_id", "clients.id")
        .leftJoin("devices as d", "d.client_id", "clients.id")
        .groupBy("clients.id")
        .orderBy("clients.name");
    },

    getClient: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return await db("clients")
        .where("clients.id", id)
        .select(
          "clients.*",
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"
          ),
          db.raw(
            "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count"
          ),
          db.raw(
            "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count"
          ),
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"
          )
        )
        .leftJoin("agents as a", "a.client_id", "clients.id")
        .leftJoin("devices as d", "d.client_id", "clients.id")
        .groupBy("clients.id")
        .first();
    },

    getClientMonitors: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      return await db("agents")
        .where("agents.client_id", id)
        .select(
          "agents.id",
          "agents.name",
          "agents.status",
          "agents.last_seen",
          "agents.hardware_id",
          "agents.host_name",
          "agents.scan_interval_minutes",
          // `ip_ranges` es topología interna de la LAN del cliente — sólo para
          // admin/operator, no para un client_viewer de sólo lectura.
          ...(scope.kind === "all" ? ["agents.ip_ranges"] : []),
          db.raw(
            "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count"
          )
        )
        .leftJoin("devices as d", "d.agent_id", "agents.id")
        .groupBy("agents.id")
        .orderBy("agents.name");
    },

    getClientUsage: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      // Suma de deltas positivos entre lecturas consecutivas por dispositivo (no MAX-MIN
      // del mes): un reset/decremento de contador no debe inflar ni romper el volumen.
      // El CTE calcula deltas sobre una ventana extendida 40 días atrás de los 4 meses
      // mostrados, para que el primer delta de cada mes tome como base la última
      // lectura del mes anterior; el filtro por mes se aplica después, sobre la fecha
      // de la lectura actual (no sobre la que se usa como base).
      const result = await db.raw(
        `
        WITH deltas AS (
          SELECT
            r.time,
            r.mono_pages  - LAG(r.mono_pages)  OVER (PARTITION BY r.device_id ORDER BY r.time) AS mono_delta,
            r.color_pages - LAG(r.color_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS color_delta
          FROM readings r
          JOIN devices d ON r.device_id = d.id
          WHERE d.client_id = ?
            AND d.merged_into IS NULL
            AND r.time >= date_trunc('month', NOW() - INTERVAL '4 months') - INTERVAL '40 days'
        )
        SELECT
          to_char(date_trunc('month', time), 'Mon YYYY') AS month,
          date_trunc('month', time) AS month_date,
          SUM(GREATEST(mono_delta, 0))::int  as mono,
          SUM(GREATEST(color_delta, 0))::int as color
        FROM deltas
        WHERE time >= date_trunc('month', NOW() - INTERVAL '4 months')
        GROUP BY date_trunc('month', time)
        ORDER BY month_date ASC
      `,
        [id]
      );
      return result.rows as Array<{ month: string; month_date: Date; mono: number; color: number }>;
    },

    getClientDevices: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const { include } = request.query as { include?: string };
      const includeDecommissioned = include === "decommissioned" || include === "all";
      return await db("devices")
        .leftJoin("agents", "devices.agent_id", "agents.id")
        .where("devices.client_id", id)
        .modify((q) => {
          if (!includeDecommissioned) onlyLiveDevices(q, "devices");
          else notMerged(q, "devices");
        })
        .select(
          "devices.*",
          db.raw(
            "CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"
          ),
          "agents.name as monitor_name",
          "agents.last_seen as monitor_last_seen"
        )
        .orderBy("devices.brand");
    },

    listApiKeys: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return apiKeyService.listApiKeys(db, id);
    },

    createApiKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name?: string };
      if (!name?.trim()) return reply.status(400).send({ error: "name es requerido" });
      const created = await apiKeyService.createApiKey(db, id, name.trim());
      // El valor en claro se devuelve UNA sola vez acá — no se puede recuperar después.
      return reply.status(201).send(created);
    },

    revokeApiKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, keyId } = request.params as { id: string; keyId: string };
      const updated = await apiKeyService.revokeApiKey(db, id, keyId);
      if (updated === 0) return reply.status(404).send({ error: "API key no encontrada o ya revocada" });
      return { ok: true };
    },
  };
}
