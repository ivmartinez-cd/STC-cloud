import type { FastifyReply, FastifyRequest } from "fastify";
import type { AgentService, AgentConfigUpdate } from "../../../services/agentService";
import { IpRangeValidationError } from "../../../services/ipRangeSpec";
import { BusinessHoursValidationError } from "../../../services/businessHours";
import { MissingEncryptionKeyError } from "../../../services/cryptoService";
import { SnmpCredentialValidationError } from "../../../services/snmpCredentials";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getClientIp } from "../../utils/ip";
import type { AgentIdParams } from "./shared";

async function getConfig(agentService: AgentService, request: FastifyRequest) {
  const { id } = request.params as AgentIdParams;
  // `agentService.getConfig()` es el método que alimenta el HEARTBEAT del
  // agente y por eso descifra `snmp_credentials` a texto plano — NUNCA se
  // le puede devolver eso al portal, ni a admin/operator. Se pide la
  // config general y se pisa el campo con la vista enmascarada (o se lo
  // saca del todo si no hay ninguna credencial guardada).
  const config = await agentService.getConfig(id);
  if (config) {
    const masked = await agentService.getSnmpCredentialsMasked(id);
    if (masked && masked.credentials.length > 0) {
      config.snmp_credentials = masked.credentials;
    } else {
      delete config.snmp_credentials;
    }
    // Mismo criterio que arriba: `getConfig()` ya viene con `ip_ranges`
    // COMPILADO (CIDR/exclusiones expandidos a pares planos, lo que
    // necesita el heartbeat) — el portal necesita ver el spec crudo tal
    // cual el admin lo escribió, no una lista fragmentada de sub-rangos.
    config.ip_ranges = await agentService.getIpRangeSpecsRaw(id);
  }
  return config;
}

async function updateConfig(agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  try {
    return await agentService.updateConfig(id, request.body as AgentConfigUpdate, {
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

async function getSnmpCredentials(agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const result = await agentService.getSnmpCredentialsMasked(id);
  if (!result) return reply.status(404).send({ error: "Monitor no encontrado" });
  return result;
}

async function updateSnmpCredentials(agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  try {
    const result = await agentService.replaceSnmpCredentials(id, request.body, {
      userId: user?.userId,
      ip: getClientIp(request),
    });
    if (!result) return reply.status(404).send({ error: "Monitor no encontrado" });
    if (result.status === "conflict") {
      return reply.status(409).send({
        error: "La lista de credenciales cambió desde que la cargaste — recargá y volvé a intentar",
        rev: result.rev,
      });
    }
    return result;
  } catch (e: unknown) {
    if (e instanceof MissingEncryptionKeyError) {
      return reply.status(503).send({ error: e.message, code: e.code });
    }
    if (e instanceof SnmpCredentialValidationError) {
      return reply.status(400).send({ error: e.message, field: e.field });
    }
    throw e;
  }
}

export function createPortalAgentConfigHandlers(agentService: AgentService) {
  return {
    getConfig: (request: FastifyRequest) => getConfig(agentService, request),
    updateConfig: (request: FastifyRequest, reply: FastifyReply) => updateConfig(agentService, request, reply),
    getSnmpCredentials: (request: FastifyRequest, reply: FastifyReply) => getSnmpCredentials(agentService, request, reply),
    updateSnmpCredentials: (request: FastifyRequest, reply: FastifyReply) => updateSnmpCredentials(agentService, request, reply),
  };
}
