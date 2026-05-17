import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { AgentService } from "../../services/agentService";

const JWT_AGENT_TTL = "30d";
const JWT_PORTAL_TTL = "8h";

export function createAuthController(fastify: FastifyInstance, agentService: AgentService) {
  return {
    portalLogin: async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as any;
      const adminUser = process.env.PORTAL_ADMIN_USER || "admin";
      const adminPass = process.env.PORTAL_ADMIN_PASSWORD;

      if (!adminPass) {
        return reply.status(503).send({ error: "PORTAL_ADMIN_PASSWORD no configurado en .env" });
      }
      if (username !== adminUser || password !== adminPass) {
        return reply.status(401).send({ error: "Credenciales inválidas" });
      }

      const token = fastify.jwt.sign(
        { role: "portal", userId: adminUser },
        { expiresIn: JWT_PORTAL_TTL }
      );
      reply.setCookie("stc_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      return { ok: true, token };
    },

    portalLogout: async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.clearCookie("stc_session", { path: "/" });
      return { ok: true };
    },

    portalMe: async (request: FastifyRequest) => {
      const user = (request as any).user as any;
      const token = request.cookies.stc_session;
      return { userId: user.userId, role: user.role, token };
    },

    agentActivate: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as any;
      const key = body.key?.trim();
      const hardwareId = body.hardwareId?.trim() || "unknown";

      request.log.info(
        `[AUTH] Solicitud de activación recibida. Key: ${key?.substring(0, 8)}... HardwareId: ${hardwareId}`
      );

      try {
        if (!key) throw new Error("La clave de activacion es requerida");
        if (key.length !== 64) {
          console.warn(`[AUTH] Clave de activación con longitud inválida: ${key.length}`);
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
      } catch (err: any) {
        return reply.status(401).send({ error: err.message });
      }
    },

    agentRefresh: async (request: FastifyRequest, reply: FastifyReply) => {
      const { agentId, refresh_token } = request.body as any;
      try {
        const result = await agentService.refreshAgentToken(agentId, refresh_token);
        const token = fastify.jwt.sign(
          { agentId: result.agentId, jti: crypto.randomUUID() },
          { expiresIn: JWT_AGENT_TTL }
        );
        return { status: "success", token, refresh_token: result.refreshToken };
      } catch (err: any) {
        return reply.status(401).send({ error: err.message });
      }
    },

    agentVersion: async () => ({
      version: process.env.AGENT_VERSION ?? "1.0.0",
      url: process.env.AGENT_DOWNLOAD_URL ?? null,
      hash: process.env.AGENT_HASH ?? null,
    }),
  };
}
