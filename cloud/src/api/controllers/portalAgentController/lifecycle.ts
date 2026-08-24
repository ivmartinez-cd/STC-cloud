import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService, AgentConfigUpdate } from "../../../services/agentService";
import { IpRangeValidationError } from "../../../services/ipRangeSpec";
import { BusinessHoursValidationError } from "../../../services/businessHours";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getClientIp } from "../../utils/ip";
import type { AgentIdParams } from "./shared";

async function createAgent(agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { clientId, name, ip_ranges, snmp_community, scan_interval_minutes, business_hours } =
    request.body as { clientId: string; name: string; ip_ranges?: unknown; snmp_community?: string; scan_interval_minutes?: number; business_hours?: unknown };
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  try {
    return await agentService.createActivationKey(clientId, name, {
      ip_ranges: ip_ranges as AgentConfigUpdate["ip_ranges"],
      snmp_community,
      scan_interval_minutes,
      business_hours: business_hours as AgentConfigUpdate["business_hours"],
    }, {
      userId: user?.userId,
      ip: getClientIp(request),
    });
  } catch (e: unknown) {
    if (e instanceof IpRangeValidationError || e instanceof BusinessHoursValidationError) {
      return reply.status(400).send({ error: e.message, field: e.field });
    }
    throw e;
  }
}

async function deleteAgentCascade(db: Knex, id: string, user: PortalUser | undefined, requestIp: string) {
  const agent = await db("agents").where({ id }).select("name", "client_id").first();
  const devices = await db("devices").where("agent_id", id).select("id");
  const deviceIds = devices.map((d: { id: string }) => d.id);

  if (deviceIds.length > 0) {
    // Mientras `devices.agent_id` sea ON DELETE CASCADE, borrar un agente
    // es una puerta trasera del ciclo de vida — bloquear si algún equipo
    // tiene historial de facturación en vez de destruirlo en silencio.
    const hasClosureLines = await db("report_closure_lines").whereIn("device_id", deviceIds).first();
    if (hasClosureLines) {
      throw Object.assign(
        new Error("Hay equipos con historial de facturación; movelos a otro monitor o dalos de baja antes de eliminar este agente"),
        { status: 409 }
      );
    }
    await db("readings").whereIn("device_id", deviceIds).delete();
    await db("devices").where("agent_id", id).delete();
  }

  await db("agents").where("id", id).delete();

  await db("audit_logs").insert({
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
}

async function deleteAgent(fastify: FastifyInstance, db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return reply.status(400).send({ error: "ID de agente inválido" });
  }
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  const requestIp = getClientIp(request);
  try {
    fastify.log.info({ agentId: id }, "Solicitud de eliminación de agente y cascada");
    await db.transaction((trx) => deleteAgentCascade(trx, id, user, requestIp));
    return { status: "deleted" };
  } catch (err: any) {
    if (err?.status === 409) {
      return reply.status(409).send({ error: err.message });
    }
    fastify.log.error(err, "Error al eliminar agente");
    const errMsg = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: "Internal Server Error", details: errMsg });
  }
}

async function revokeAgent(agentService: AgentService, redis: Redis, request: FastifyRequest) {
  const { id } = request.params as AgentIdParams;
  const requestIp = getClientIp(request);
  await agentService.revokeToken(redis, id, 30 * 24 * 60 * 60, requestIp);
  return { status: "revoked" };
}

async function regenerateKey(agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
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
}

export function createPortalAgentLifecycleHandlers(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  return {
    createAgent: (request: FastifyRequest, reply: FastifyReply) => createAgent(agentService, request, reply),
    deleteAgent: (request: FastifyRequest, reply: FastifyReply) => deleteAgent(fastify, db, request, reply),
    revokeAgent: (request: FastifyRequest) => revokeAgent(agentService, redis, request),
    regenerateKey: (request: FastifyRequest, reply: FastifyReply) => regenerateKey(agentService, request, reply),
  };
}
