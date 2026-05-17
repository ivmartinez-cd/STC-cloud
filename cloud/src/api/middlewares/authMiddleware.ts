import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";

export function createAuthMiddleware(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  async function agentAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const user = request.user as any;
      if (!user.agentId) {
        return reply.status(403).send({ error: "Token de portal no puede acceder a esta ruta" });
      }

      const { id } = request.params as any;
      if (id && id !== user.agentId) {
        return reply.status(403).send({ error: "No tiene permisos para acceder a este agente" });
      }

      const agent = await db("agents").where({ id: user.agentId }).select("status").first();
      if (!agent || agent.status === "revoked") {
        return reply.status(404).send({ error: "Agente no encontrado o revocado" });
      }

      const blacklisted = await agentService.isBlacklisted(redis, user.agentId);
      if (blacklisted) {
        return reply.status(401).send({ error: "Token revocado" });
      }
    } catch {
      return reply.status(401).send({ error: "Token inválido o expirado" });
    }
  }

  async function portalAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.cookies?.stc_session;
      if (!token) {
        return reply.status(401).send({ error: "No autenticado" });
      }
      const decoded = fastify.jwt.verify<{ role: string; userId: string }>(token);
      if (decoded.role !== "portal") {
        return reply.status(403).send({ error: "Token de agente no puede acceder a esta ruta" });
      }
      (request as any).user = decoded;
    } catch {
      return reply.status(401).send({ error: "Token inválido o expirado" });
    }
  }

  return { agentAuth, portalAuth };
}
