import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { ApiKeyClient } from "../middlewares/authMiddleware";
import { onlyLiveDevices } from "../utils/deviceFilters";
import { getWebhookConfig, upsertWebhookConfig, type PublicApiEvent } from "../../services/publicWebhookService";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EVENTS: PublicApiEvent[] = ["reading.created", "alert.created", "report.closed"];

function clientIdOf(request: FastifyRequest): string {
  return (request as FastifyRequest & { apiKeyClient: ApiKeyClient }).apiKeyClient.clientId;
}

function pageParams(request: FastifyRequest, defaultLimit = 100, maxLimit = 500) {
  const { limit, offset } = request.query as { limit?: string; offset?: string };
  return {
    limit: Math.min(Number(limit) || defaultLimit, maxLimit),
    offset: Math.max(Number(offset) || 0, 0),
  };
}

/**
 * API pública (integración ERP) — scope SIEMPRE fijo al cliente de la API
 * key, nunca "todos" (a diferencia de `scope.ts`/`getScope`, pensado para
 * portalAuth/roles de portal, no reusable acá porque una API key no es un
 * `PortalUser`). Controladores propios y deliberadamente más simples que sus
 * equivalentes de portal — sin la lógica de admin/operator/client_viewer.
 */
export function createPublicApiController(db: Knex) {
  return {
    listDevices: async (request: FastifyRequest) => {
      const clientId = clientIdOf(request);
      const { limit, offset } = pageParams(request);
      return db("devices")
        .where("devices.client_id", clientId)
        .modify((q) => onlyLiveDevices(q, "devices"))
        .select("id", "name", "serial_number", "ip_address", "hostname", "location", "sku", "active", "last_seen")
        .orderBy("name")
        .limit(limit)
        .offset(offset);
    },

    getDeviceReadings: async (request: FastifyRequest, reply: FastifyReply) => {
      const clientId = clientIdOf(request);
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return reply.status(400).send({ error: "id inválido" });

      const owned = await db("devices").where({ id, client_id: clientId }).select("id").first();
      if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });

      const { from, to, limit } = request.query as { from?: string; to?: string; limit?: string };
      const query = db("readings")
        .where({ device_id: id })
        .whereNotNull("total_pages")
        .orderBy("time", "desc")
        .limit(Math.min(Number(limit) || 500, 5000));
      if (from) query.where("time", ">=", new Date(from));
      if (to) query.where("time", "<=", new Date(to));

      return query.select("time", "total_pages", "mono_pages", "color_pages", "offline");
    },

    listAlerts: async (request: FastifyRequest) => {
      const clientId = clientIdOf(request);
      const { resolved } = request.query as { resolved?: string };
      const { limit: pageLimit, offset: pageOffset } = pageParams(request);

      return db("alerts")
        .leftJoin("devices", "alerts.device_id", "devices.id")
        .leftJoin("agents", "agents.id", db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
        .where((b) => {
          b.where("devices.client_id", clientId).orWhere((b2) => {
            b2.whereNull("alerts.device_id").andWhere("agents.client_id", clientId);
          });
        })
        .modify((q) => {
          if (resolved !== undefined) q.andWhere("alerts.resolved", resolved === "true");
        })
        .orderBy("alerts.created_at", "desc")
        .limit(pageLimit)
        .offset(pageOffset)
        .select(
          "alerts.id",
          "alerts.type",
          "alerts.severity",
          "alerts.message",
          "alerts.resolved",
          "alerts.created_at",
          "alerts.device_id",
          "devices.name as device_name"
        );
    },

    listReportClosures: async (request: FastifyRequest) => {
      const clientId = clientIdOf(request);
      const { limit, offset } = pageParams(request);
      return db("report_closures")
        .where({ client_id: clientId })
        .orderBy("period", "desc")
        .limit(limit)
        .offset(offset)
        .select(
          "id", "period", "status", "closed_at", "reopened_at", "superseded_by",
          "total_pages", "total_mono", "total_color"
        );
    },

    /** Header + detalle por equipo — mismo patrón que `reportController.getClosure`. */
    getReportClosure: async (request: FastifyRequest, reply: FastifyReply) => {
      const clientId = clientIdOf(request);
      const { id } = request.params as { id: string };
      const closure = await db("report_closures").where({ id, client_id: clientId }).first();
      if (!closure) return reply.status(404).send({ error: "Cierre no encontrado" });
      const lines = await db("report_closure_lines")
        .where({ closure_id: id })
        .orderBy("device_serial")
        .select(
          "device_id", "device_serial", "device_model", "device_brand",
          "first_reading_at", "first_total_pages", "first_mono_pages", "first_color_pages",
          "last_reading_at", "last_total_pages", "last_mono_pages", "last_color_pages",
          "delta_total", "delta_mono", "delta_color", "had_counter_reset"
        );
      return { ...closure, lines };
    },

    getWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
      const config = await getWebhookConfig(db, clientIdOf(request));
      if (!config) return reply.status(404).send({ error: "Sin webhook configurado" });
      return config;
    },

    putWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { url?: string; events?: string[]; active?: boolean; regenerate_secret?: boolean };
      if (body.events && !body.events.every((e) => VALID_EVENTS.includes(e as PublicApiEvent))) {
        return reply.status(400).send({ error: `events debe ser subconjunto de ${VALID_EVENTS.join(", ")}` });
      }
      const config = await upsertWebhookConfig(db, clientIdOf(request), {
        url: body.url,
        events: body.events as PublicApiEvent[] | undefined,
        active: body.active,
        regenerateSecret: body.regenerate_secret,
      });
      return config;
    },
  };
}
