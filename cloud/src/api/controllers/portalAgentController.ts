import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService, AgentConfigUpdate } from "../../services/agentService";
import { sendCommandToAgent } from "../../ws/index";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";

/** Parámetros de ruta con ID de agente. */
interface AgentIdParams { id: string; }

/** Query string con límite opcional. */
interface LimitQuery { limit?: string; }

function formatDateAR(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return date.toISOString();
  }
}

export function createPortalAgentController(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  return {
    listAgents: async () =>
      await db("agents")
        .join("clients", "agents.client_id", "clients.id")
        .select(
          "agents.id",
          "agents.name",
          "agents.hardware_id",
          "agents.version",
          "agents.host_name",
          "agents.host_os",
          "agents.host_ip",
          "agents.uptime",
          "agents.status",
          "agents.last_seen",
          "agents.client_id",
          "agents.created_at",
          "clients.name as client_name"
        )
        .orderBy("agents.created_at", "desc"),

    getAgent: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const agent = await db("agents")
        .where("agents.id", id)
        .select(
          "agents.*",
          "clients.name as client_name",
          "clients.id as client_id",
          db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS active_device_count"),
          db.raw("COUNT(DISTINCT d.id)::int AS total_device_count")
        )
        .leftJoin("clients", "clients.id", "agents.client_id")
        .leftJoin("devices as d", "d.agent_id", "agents.id")
        .groupBy("agents.id", "clients.name", "clients.id")
        .first();
      if (!agent) return { error: "Monitor no encontrado" };

      let parsedIpRanges = [];
      if (agent.ip_ranges) {
        try {
          parsedIpRanges = typeof agent.ip_ranges === "string" ? JSON.parse(agent.ip_ranges) : agent.ip_ranges;
        } catch (e) {
          console.error("Error parsing ip_ranges in getAgent:", e);
        }
      }

      let parsedScanSchedule = null;
      if (agent.scan_schedule) {
        try {
          parsedScanSchedule = typeof agent.scan_schedule === "string" ? JSON.parse(agent.scan_schedule) : agent.scan_schedule;
        } catch (e) {
          console.error("Error parsing scan_schedule in getAgent:", e);
        }
      }

      return {
        ...agent,
        config: {
          ip_ranges: parsedIpRanges,
          snmp_community: agent.snmp_community,
          scan_interval_minutes: agent.scan_interval_minutes,
          scan_schedule: parsedScanSchedule,
          toner_warning_threshold: agent.toner_warning_threshold,
          toner_critical_threshold: agent.toner_critical_threshold,
        },
      };
    },

    getAgentDevices: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      // Suma de deltas positivos entre lecturas consecutivas (no MAX-MIN del mes): un
      // reset/decremento de contador no debe inflar el volumen mensual mostrado en el
      // reporte del monitor. La subconsulta interna se extiende 40 días atrás para que
      // la primera lectura del mes tenga como base la última lectura del mes anterior.
      const monthlySubquery = db.raw(`
        (
          SELECT
            device_id,
            SUM(GREATEST(total_pages_delta, 0))::int AS monthly_pages,
            SUM(GREATEST(mono_pages_delta,  0))::int AS monthly_mono,
            SUM(GREATEST(color_pages_delta, 0))::int AS monthly_color
          FROM (
            SELECT
              device_id,
              time,
              total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY time) AS total_pages_delta,
              mono_pages  - LAG(mono_pages)  OVER (PARTITION BY device_id ORDER BY time) AS mono_pages_delta,
              color_pages - LAG(color_pages) OVER (PARTITION BY device_id ORDER BY time) AS color_pages_delta
            FROM readings
            WHERE time >= date_trunc('month', now()) - INTERVAL '40 days'
          ) deltas
          WHERE time >= date_trunc('month', now())
          GROUP BY device_id
        ) as m
      `);

      return await db("devices")
        .where("devices.agent_id", id)
        .leftJoin(monthlySubquery, "m.device_id", "devices.id")
        .select(
          "devices.*",
          db.raw("COALESCE(m.monthly_pages, 0) AS monthly_pages"),
          db.raw("COALESCE(m.monthly_mono,  0) AS monthly_mono"),
          db.raw("COALESCE(m.monthly_color, 0) AS monthly_color")
        )
        .orderBy("devices.brand");
    },

    createAgent: async (request: FastifyRequest) => {
      const { clientId, name, ip_ranges, snmp_community, scan_interval_minutes } =
        request.body as { clientId: string; name: string; ip_ranges?: Array<{ start: string; end: string }>; snmp_community?: string; scan_interval_minutes?: number };
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      return await agentService.createActivationKey(clientId, name, {
        ip_ranges,
        snmp_community,
        scan_interval_minutes,
      }, {
        userId: user?.userId,
        ip: getClientIp(request),
      });
    },

    deleteAgent: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({ error: "ID de agente inválido" });
      }
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      const requestIp = getClientIp(request);
      try {
        fastify.log.info({ agentId: id }, "Solicitud de eliminación de agente y cascada");

        await db.transaction(async (trx) => {
          const agent = await trx("agents").where({ id }).select("name", "client_id").first();
          const devices = await trx("devices").where("agent_id", id).select("id");
          const deviceIds = devices.map((d: { id: string }) => d.id);

          if (deviceIds.length > 0) {
            await trx("readings").whereIn("device_id", deviceIds).delete();
            await trx("devices").where("agent_id", id).delete();
          }

          await trx("agents").where("id", id).delete();

          await trx("audit_logs").insert({
            action: "AGENT_DELETED",
            target_id: id,
            user_id: user?.userId ?? null,
            ip_address: requestIp,
            metadata: JSON.stringify({
              name: agent?.name ?? null,
              client_id: agent?.client_id ?? null,
              devices_removed: deviceIds.length,
            }),
          });
        });

        return { status: "deleted" };
      } catch (err: unknown) {
        fastify.log.error(err, "Error al eliminar agente");
        const errMsg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: "Internal Server Error", details: errMsg });
      }
    },

    revokeAgent: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const requestIp = getClientIp(request);
      await agentService.revokeToken(redis, id, 30 * 24 * 60 * 60, requestIp);
      return { status: "revoked" };
    },

    regenerateKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      try {
        return await agentService.regenerateActivationKey(id, {
          userId: user?.userId,
          ip: getClientIp(request),
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({ error: errMsg });
      }
    },

    sendCommand: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const { type, payload } = request.body as { type: string; payload?: Record<string, unknown> };
      const user = (request as FastifyRequest & { user: PortalUser }).user;

      const command = await agentService.addCommand(id, type, payload || {}, user?.userId);
      fastify.log.info(
        { agentId: id, type, commandId: command.id },
        "Comando remoto registrado y pendiente"
      );

      await db("audit_logs").insert({
        action: "AGENT_COMMAND",
        target_id: id,
        user_id: user?.userId ?? null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ type, payload: payload || {} }),
      });

      const sentViaWss = sendCommandToAgent(id, type, payload || {}, command.id);
      if (sentViaWss) {
        fastify.log.info({ agentId: id }, "Comando empujado instantáneamente vía WSS");
      }

      return { success: true, commandId: command.id, instant: sentViaWss };
    },

    triggerScan: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const sentInstant = sendCommandToAgent(id, "RESCAN");
      await agentService.addCommand(id, "RESCAN");
      return {
        status: "success",
        message: sentInstant
          ? "Comando enviado instantáneamente vía WSS"
          : "Agente offline. Comando encolado para próximo latido.",
      };
    },

    getLogs: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const { limit } = request.query as LimitQuery;
      return await agentService.getLogs(id, limit ? parseInt(limit, 10) : 50);
    },

    exportLogs: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const logs = await agentService.getLogs(id, 1000);
      logs.reverse();

      let report = "================================================================================\n";
      report += "STC CLOUD - REPORTE DE AUDITORÍA DE AGENTE\n";
      report += "================================================================================\n";
      report += `Agente ID: ${id}\n`;
      report += `Generado:  ${formatDateAR(new Date())}\n`;
      report += "--------------------------------------------------------------------------------\n\n";
      report += "[ FECHA Y HORA ]        [ NIVEL ]   [ MENSAJE ]\n";
      report += "--------------------------------------------------------------------------------\n";

      logs.forEach((l: { timestamp?: string; level?: string; message: string }) => {
        const dateObj = new Date(l.timestamp ?? 0);
        const time = isNaN(dateObj.getTime()) ? "---" : formatDateAR(dateObj);
        const level = (l.level || "INFO").padEnd(8);
        report += `${time.padEnd(23)} ${level} ${l.message}\n`;
      });

      report += "\n--------------------------------------------------------------------------------\n";
      report += "Fin del reporte - STC Cloud Monitor\n";

      reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Disposition", `attachment; filename=log_${id}.txt`)
        .send(report);
    },

    getConfig: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      return await agentService.getConfig(id);
    },

    updateConfig: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      return await agentService.updateConfig(id, request.body as AgentConfigUpdate, {
        userId: user?.userId,
        ip: getClientIp(request),
      });
    },
  };
}
