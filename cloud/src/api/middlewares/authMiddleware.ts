import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";

// ─── Tipos de Autenticación Exportados ───────────────────────────────────────

/** Firma estándar de un hook de autenticación pre-handler de Fastify. */
export type AuthHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** Usuario del portal inyectado en `request.user` tras la autenticación. */
export interface PortalUser {
  userId: string;
  username?: string;
  role: string;
  active: boolean;
}

/** Payload decodificado del JWT del agente. */
interface AgentJwtPayload {
  agentId?: string;
}

/** Payload decodificado del JWT del portal. */
interface PortalJwtPayload {
  role: string;
  userId: string;
}
/**
 * Crea los middlewares de autenticación JWT para rutas de agente y portal.
 * Implementa RBAC estricto: un token de agente no puede acceder a rutas de portal y viceversa.
 *
 * @param fastify - Instancia del servidor con plugin JWT registrado.
 * @param db - Conexión Knex para validar estado del agente/usuario.
 * @param redis - Cliente Redis para verificar blacklist de tokens revocados.
 * @param agentService - Servicio de agentes para consultas de blacklist.
 * @returns Objeto con hooks `agentAuth` y `portalAuth`.
 */
export function createAuthMiddleware(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  async function agentAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const user = request.user as AgentJwtPayload;
      if (!user.agentId) {
        return reply.status(403).send({ error: "Token de portal no puede acceder a esta ruta" });
      }

      const { id } = request.params as { id?: string };
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
      let token = request.cookies?.stc_session;
      if (!token) {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        return reply.status(401).send({ error: "No autenticado" });
      }
      const decoded = fastify.jwt.verify<PortalJwtPayload>(token);
      if (decoded.role !== "portal") {
        return reply.status(403).send({ error: "Token de agente no puede acceder a esta ruta" });
      }

      // Validar si el usuario existe y está activo
      const user = await db("users")
        .where(db.raw("CAST(id AS TEXT) = ? OR username = ?", [decoded.userId, decoded.userId]))
        .first();

      if (!user) {
        return reply.status(401).send({ error: "Usuario no encontrado" });
      }

      if (!user.active) {
        return reply.status(401).send({ error: "Usuario desactivado" });
      }

      (request as FastifyRequest & { user: PortalUser }).user = {
        userId: user.id,
        username: user.username,
        role: user.role,
        active: user.active,
      };
    } catch {
      return reply.status(401).send({ error: "Token inválido o expirado" });
    }
  }

  return { agentAuth, portalAuth };
}
