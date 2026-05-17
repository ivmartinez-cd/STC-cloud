import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { sendCommandToAgent } from "../../ws/index";

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
          "agents.status",
          "agents.last_seen",
          "agents.client_id",
          "agents.created_at",
          "clients.name as client_name"
        )
        .orderBy("agents.created_at", "desc"),

    getAgent: async (request: FastifyRequest) => {
      const { id } = request.params as any;
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
      return agent;
    },

    getAgentDevices: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      return await db("devices").where("agent_id", id).select("*").orderBy("brand");
    },

    createAgent: async (request: FastifyRequest) => {
      const { clientId, name, ip_ranges, snmp_community, scan_interval_minutes } =
        request.body as any;
      return await agentService.createActivationKey(clientId, name, {
        ip_ranges,
        snmp_community,
        scan_interval_minutes,
      });
    },

    deleteAgent: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({ error: "ID de agente inválido" });
      }
      try {
        fastify.log.info({ agentId: id }, "Solicitud de eliminación de agente y cascada");

        await db.transaction(async (trx) => {
          const devices = await trx("devices").where("agent_id", id).select("id");
          const deviceIds = devices.map((d: any) => d.id);

          if (deviceIds.length > 0) {
            await trx("readings").whereIn("device_id", deviceIds).delete();
            await trx("devices").where("agent_id", id).delete();
          }

          await trx("agents").where("id", id).delete();
        });

        return { status: "deleted" };
      } catch (err: any) {
        fastify.log.error(err, "Error al eliminar agente");
        return reply.status(500).send({ error: "Internal Server Error", details: err.message });
      }
    },

    revokeAgent: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      const requestIp = (request.headers["x-forwarded-for"] as string) || request.ip;
      await agentService.revokeToken(redis, id, 30 * 24 * 60 * 60, requestIp);
      return { status: "revoked" };
    },

    regenerateKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      try {
        return await agentService.regenerateActivationKey(id);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    },

    sendCommand: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      const { type, payload } = request.body as any;
      const user = (request as any).user;

      const command = await agentService.addCommand(id, type, payload || {}, user?.userId);
      fastify.log.info(
        { agentId: id, type, commandId: command.id },
        "Comando remoto registrado y pendiente"
      );

      const sentViaWss = sendCommandToAgent(id, type, payload || {}, command.id);
      if (sentViaWss) {
        fastify.log.info({ agentId: id }, "Comando empujado instantáneamente vía WSS");
      }

      return { success: true, commandId: command.id, instant: sentViaWss };
    },

    triggerScan: async (request: FastifyRequest) => {
      const { id } = request.params as any;
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
      const { id } = request.params as any;
      const { limit } = request.query as any;
      return await agentService.getLogs(id, parseInt(limit) || 50);
    },

    exportLogs: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
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

      logs.forEach((l: any) => {
        const dateObj = new Date(l.timestamp);
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
      const { id } = request.params as any;
      return await agentService.getConfig(id);
    },

    updateConfig: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      return await agentService.updateConfig(id, request.body);
    },
  };
}
