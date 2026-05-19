import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { Knex } from "knex";
import { AgentService } from "../../services/agentService";
import { hashPassword, verifyPassword } from "../utils/password";

const JWT_AGENT_TTL = "30d";
const JWT_PORTAL_TTL = "8h";

export function createAuthController(fastify: FastifyInstance, db: Knex, agentService: AgentService) {
  return {
    portalLogin: async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as any;

      if (!username || !password) {
        return reply.status(400).send({ error: "Usuario y contraseña son requeridos" });
      }

      const cleanUsername = username.trim().toLowerCase();

      // Buscar el usuario en la base de datos
      const user = await db("users").where({ username: cleanUsername }).first();

      if (!user) {
        // Fallback temporal si no se ha inicializado el admin en la base de datos y coincide con el env
        const adminUser = (process.env.PORTAL_ADMIN_USER || "admin").toLowerCase();
        const adminPass = process.env.PORTAL_ADMIN_PASSWORD;
        if (adminPass && cleanUsername === adminUser && password === adminPass) {
          const token = fastify.jwt.sign(
            { role: "portal", userId: "admin" },
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
        }
        return reply.status(401).send({ error: "Credenciales inválidas" });
      }

      if (!user.active) {
        return reply.status(401).send({ error: "El usuario está desactivado" });
      }

      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        return reply.status(401).send({ error: "Credenciales inválidas" });
      }

      const token = fastify.jwt.sign(
        { role: "portal", userId: user.id },
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
      return { userId: user.userId, username: user.username, role: user.role, token };
    },

    listUsers: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as any).user as any;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const users = await db("users")
        .select("id", "username", "role", "active", "created_at", "updated_at")
        .orderBy("username", "asc");
      return users;
    },

    createUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as any).user as any;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const { username, password, role } = request.body as any;

      if (!username || !password) {
        return reply.status(400).send({ error: "Usuario y contraseña son requeridos" });
      }

      const cleanUsername = username.trim().toLowerCase();
      const existing = await db("users").where({ username: cleanUsername }).first();
      if (existing) {
        return reply.status(409).send({ error: "El nombre de usuario ya existe" });
      }

      const [newUser] = await db("users")
        .insert({
          id: db.raw("gen_random_uuid()"),
          username: cleanUsername,
          password_hash: hashPassword(password),
          role: role || "operator",
          active: true,
        })
        .returning(["id", "username", "role", "active", "created_at"]);

      return newUser;
    },

    updateUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as any).user as any;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const { id } = request.params as any;
      const { password, role, active } = request.body as any;

      const user = await db("users").where({ id }).first();
      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      if (user.id === currentUser.userId && active === false) {
        return reply.status(400).send({ error: "No puedes desactivar tu propio usuario" });
      }

      const updates: any = { updated_at: new Date() };
      if (password) {
        updates.password_hash = hashPassword(password);
      }
      if (role !== undefined) {
        updates.role = role;
      }
      if (active !== undefined) {
        updates.active = active;
      }

      const [updatedUser] = await db("users")
        .where({ id })
        .update(updates)
        .returning(["id", "username", "role", "active", "updated_at"]);

      return updatedUser;
    },

    deleteUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as any).user as any;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const { id } = request.params as any;

      const user = await db("users").where({ id }).first();
      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      if (user.id === currentUser.userId) {
        return reply.status(400).send({ error: "No puedes eliminar tu propio usuario" });
      }

      await db("users").where({ id }).delete();
      return { success: true };
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
