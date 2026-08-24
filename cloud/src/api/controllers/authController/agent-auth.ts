import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import type { AgentService } from "../../../modules/agents";
import { logger } from "../../../logger";
import type { ActivateBody, RefreshBody } from "./shared";
import { JWT_AGENT_TTL } from "./shared";

async function agentActivate(fastify: FastifyInstance, agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as ActivateBody;
  const key = body.key?.trim();
  const hardwareId = body.hardwareId?.trim();
  if (!hardwareId || hardwareId.length < 8 || hardwareId === "unknown") {
    return reply.status(400).send({ error: "Hardware ID inválido o no proporcionado. Verificar permisos del sistema." });
  }

  request.log.info(
    `[AUTH] Solicitud de activación recibida. Key: ${key?.substring(0, 8)}... HardwareId: ${hardwareId}`
  );

  try {
    if (!key) throw new Error("La clave de activacion es requerida");
    if (key.length !== 64) {
      logger.warn(`[AUTH] Clave de activación con longitud inválida: ${key.length}`);
      throw new Error("La clave de activación debe tener exactamente 64 caracteres");
    }
    const result = await agentService.activateAgent(key, hardwareId);
    const token = fastify.jwt.sign(
      { agentId: result.agentId, jti: crypto.randomUUID() },
      { expiresIn: JWT_AGENT_TTL }
    );
    return {
      status: "success",
      agentId: result.agentId,
      token,
      refresh_token: result.refreshToken,
      config: { pollInterval: 30, heartbeatInterval: 60 },
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return reply.status(401).send({ error: errMsg });
  }
}

async function agentRefresh(fastify: FastifyInstance, agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { agentId, refresh_token } = request.body as RefreshBody;
  try {
    const result = await agentService.refreshAgentToken(agentId, refresh_token);
    const token = fastify.jwt.sign(
      { agentId: result.agentId, jti: crypto.randomUUID() },
      { expiresIn: JWT_AGENT_TTL }
    );
    return { status: "success", token, refresh_token: result.refreshToken };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return reply.status(401).send({ error: errMsg });
  }
}

export function createAuthAgentHandlers(fastify: FastifyInstance, agentService: AgentService) {
  return {
    agentActivate: (request: FastifyRequest, reply: FastifyReply) => agentActivate(fastify, agentService, request, reply),
    agentRefresh: (request: FastifyRequest, reply: FastifyReply) => agentRefresh(fastify, agentService, request, reply),
  };
}
