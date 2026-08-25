import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import { IpRangeValidationError } from "../../../shared/domain/ip-range-spec";
import { BusinessHoursValidationError } from "../../../shared/domain/business-hours";
import { MissingEncryptionKeyError } from "../../../services/cryptoService";
import { SnmpCredentialValidationError } from "../../../services/snmpCredentials";
import { getClientIp } from "../../../api/utils/ip";
import { getPortalUser, getScope } from "../../../api/utils/scope";
import { UUID_RE } from "../../devices";
import type { AgentConfigUpdate } from "../domain/entities/agent";
import { AgentDeleteConflictError, AgentNotFoundError } from "../application/use-cases/portal-agent-use-cases";
import { RemoteActionError } from "../application/use-cases/remote-use-cases";
import type { AgentUseCases } from "./agent-wiring";

/** Endpoints del PORTAL sobre agentes (autenticados por `portalAuth`). */

type Req = FastifyRequest;
const idOf = (request: Req) => (request.params as { id: string }).id;
const actorOf = (request: Req) => ({ userId: getPortalUser(request)?.userId ?? null, ipAddress: getClientIp(request) });
const auditOf = (request: Req) => ({ userId: getPortalUser(request)?.userId, ip: getClientIp(request) });

/** Errores de validación de config (400 con `field`) y de dominio con status; el resto sigue siendo 500. */
async function replyingAgentErrors<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e: unknown) {
    if (e instanceof IpRangeValidationError || e instanceof BusinessHoursValidationError) return reply.status(400).send({ error: e.message, field: e.field });
    if (e instanceof SnmpCredentialValidationError) return reply.status(400).send({ error: e.message, field: e.field });
    if (e instanceof MissingEncryptionKeyError) return reply.status(503).send({ error: e.message, code: e.code });
    if (e instanceof AgentNotFoundError || e instanceof AgentDeleteConflictError || e instanceof RemoteActionError) {
      return reply.status(e.statusCode).send({ error: e.message });
    }
    throw e;
  }
}

function readHandlers(uc: AgentUseCases) {
  return {
    listAgents: (request: Req) => uc.listAgents.execute(getScope(request)),
    getAgent: (request: Req, reply: FastifyReply) => replyingAgentErrors(reply, () => uc.getAgentDetail.execute(idOf(request), getScope(request))),
    getAgentDevices: (request: Req) => uc.getAgentDevices.execute(idOf(request), (request.query as { include?: string }).include),
    getAgentStats: (request: Req) => uc.getAgentStats.execute(idOf(request)),
    getAgentConnectivity: (request: Req) => uc.getAgentConnectivity.execute(idOf(request)),
    getAgentActivity: (request: Req) => uc.getAgentActivity.execute(idOf(request), Number((request.query as { limit?: string }).limit) || undefined),
    getAgentLicense: (request: Req, reply: FastifyReply) => replyingAgentErrors(reply, () => uc.getAgentLicense.execute(idOf(request))),
    listAgentDeviceDirectory: (request: Req) => {
      const q = request.query as { q?: string; segment?: string; sort?: string; dir?: string; limit?: string; offset?: string };
      return uc.listAgentDeviceDirectory.execute({
        agentId: idOf(request), q: q.q, segment: q.segment, sortField: q.sort, sortDir: q.dir,
        limit: q.limit !== undefined ? Number(q.limit) : undefined,
        offset: q.offset !== undefined ? Number(q.offset) : undefined,
      });
    },
    getLogs: (request: Req) => {
      const { limit } = request.query as { limit?: string };
      return uc.logs.list(idOf(request), limit ? parseInt(limit, 10) : 50);
    },
    exportLogs: async (request: Req, reply: FastifyReply) => {
      const id = idOf(request);
      reply.header("Content-Type", "text/plain; charset=utf-8").header("Content-Disposition", `attachment; filename=log_${id}.txt`)
        .send(await uc.logs.exportReport(id));
    },
  };
}

function lifecycleHandlers(fastify: FastifyInstance, redis: Redis, uc: AgentUseCases) {
  return {
    createAgent: (request: Req, reply: FastifyReply) =>
      replyingAgentErrors(reply, () => {
        const { clientId, name, ip_ranges, snmp_community, scan_interval_minutes, business_hours } = request.body as {
          clientId: string; name: string; ip_ranges?: unknown; snmp_community?: string; scan_interval_minutes?: number; business_hours?: unknown;
        };
        return uc.createActivationKey.execute({
          clientId, name, audit: auditOf(request),
          config: { ip_ranges: ip_ranges as AgentConfigUpdate["ip_ranges"], snmp_community, scan_interval_minutes, business_hours: business_hours as AgentConfigUpdate["business_hours"] },
        });
      }),
    deleteAgent: async (request: Req, reply: FastifyReply) => {
      const id = idOf(request);
      if (!UUID_RE.test(id)) return reply.status(400).send({ error: "ID de agente inválido" });
      try {
        fastify.log.info({ agentId: id }, "Solicitud de eliminación de agente y cascada");
        await uc.deleteAgent.execute(id, actorOf(request));
        return { status: "deleted" };
      } catch (err: any) {
        if (err instanceof AgentDeleteConflictError) return reply.status(409).send({ error: err.message });
        fastify.log.error(err, "Error al eliminar agente");
        return reply.status(500).send({ error: "Internal Server Error", details: err instanceof Error ? err.message : String(err) });
      }
    },
    revokeAgent: async (request: Req) => {
      await uc.revokeToken(redis).execute(idOf(request), 30 * 24 * 60 * 60, getClientIp(request));
      return { status: "revoked" };
    },
    regenerateKey: async (request: Req, reply: FastifyReply) => {
      try {
        return await uc.regenerateActivationKey.execute(idOf(request), auditOf(request));
      } catch (err: unknown) {
        return reply.status(404).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function configHandlers(uc: AgentUseCases) {
  return {
    /** Config general con credenciales ENMASCARADAS y `ip_ranges` crudo (nunca lo que ve el heartbeat). */
    getConfig: async (request: Req) => {
      const id = idOf(request);
      const config = await uc.heartbeatConfig.execute(id);
      if (config) {
        const masked = await uc.snmpCredentialsMasked.execute(id);
        if (masked && masked.credentials.length > 0) config.snmp_credentials = masked.credentials; else delete config.snmp_credentials;
        config.ip_ranges = await uc.ipRangeSpecsRaw.execute(id);
      }
      return config;
    },
    updateConfig: (request: Req, reply: FastifyReply) =>
      replyingAgentErrors(reply, () => uc.updateConfig.execute(idOf(request), request.body as AgentConfigUpdate, auditOf(request))),
    getSnmpCredentials: async (request: Req, reply: FastifyReply) => {
      const result = await uc.snmpCredentialsMasked.execute(idOf(request));
      return result ?? reply.status(404).send({ error: "Monitor no encontrado" });
    },
    updateSnmpCredentials: (request: Req, reply: FastifyReply) =>
      replyingAgentErrors(reply, async () => {
        const result = await uc.replaceSnmpCredentials.execute(idOf(request), request.body, auditOf(request));
        if (!result) return reply.status(404).send({ error: "Monitor no encontrado" });
        if (result.status === "conflict") {
          return reply.status(409).send({ error: "La lista de credenciales cambió desde que la cargaste — recargá y volvé a intentar", rev: result.rev });
        }
        return result;
      }),
  };
}

function remoteHandlers(fastify: FastifyInstance, uc: AgentUseCases) {
  return {
    sendCommand: async (request: Req) => {
      const { type, payload } = request.body as { type: string; payload?: Record<string, unknown> };
      const result = await uc.sendCommand.execute({ agentId: idOf(request), type, payload, ...actorOf(request) });
      fastify.log.info({ agentId: idOf(request), type, commandId: result.commandId }, "Comando remoto registrado y pendiente");
      if (result.instant) fastify.log.info({ agentId: idOf(request) }, "Comando empujado instantáneamente vía WSS");
      return result;
    },
    ewsProxy: (request: Req, reply: FastifyReply) =>
      replyingAgentErrors(reply, () => {
        const { device_id, path } = request.body as { device_id: string; path: unknown };
        return uc.ewsProxy.execute({ agentId: idOf(request), deviceId: device_id, path, ...actorOf(request) });
      }),
    setRemoteEwsEnabled: (request: Req, reply: FastifyReply) =>
      replyingAgentErrors(reply, () => uc.setRemoteEws.execute(idOf(request), (request.body as { enabled: boolean }).enabled, actorOf(request))),
    triggerScan: (request: Req) => uc.triggerScan.execute(idOf(request)),
  };
}

export function createPortalAgentController(fastify: FastifyInstance, redis: Redis, uc: AgentUseCases) {
  return { ...readHandlers(uc), ...lifecycleHandlers(fastify, redis, uc), ...configHandlers(uc), ...remoteHandlers(fastify, uc) };
}
