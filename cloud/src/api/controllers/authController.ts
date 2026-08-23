import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { mintWsTicket } from "../../services/wsTicketService";
import { hashPassword, verifyPassword } from "../utils/password";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";
import { logger } from "../../logger";

/** Cuerpo de login del portal. */
interface LoginBody { username: string; password: string; }

/** Cuerpo de creación de usuario. */
interface CreateUserBody { username: string; password: string; role?: string; client_id?: string; }

/** Cuerpo de actualización de usuario. */
interface UpdateUserBody { password?: string; role?: string; active?: boolean; client_id?: string; }

/** Cuerpo de activación de agente. */
interface ActivateBody { key: string; hardwareId?: string; }

/** Cuerpo de refresh de agente. */
interface RefreshBody { agentId: string; refresh_token: string; }

/** Cuerpo de actualización de versión de agente. */
interface VersionUpdateBody { version: string; url: string; hash: string; }

/** Parámetros de ruta con id. */
interface IdParams { id: string; }

const JWT_AGENT_TTL = "30d";
const JWT_PORTAL_TTL = "8h";

export function createAuthController(fastify: FastifyInstance, db: Knex, redis: Redis, agentService: AgentService) {
  return {
    portalLogin: async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as LoginBody;

      if (!username || !password) {
        return reply.status(400).send({ error: "Usuario y contraseña son requeridos" });
      }

      const cleanUsername = username.trim().toLowerCase();

      // Buscar el usuario en la base de datos. El servidor siempre crea un usuario
      // administrador real en el primer boot (ver server.ts), así que no existe
      // fallback por variable de entorno: si no está en la tabla, no hay acceso.
      const user = await db("users").where({ username: cleanUsername }).first();

      if (!user) {
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
      const isProd = process.env.NODE_ENV === "production";
      const cookieOpts = {
        secure: isProd,
        sameSite: (isProd ? "none" : "lax") as "none" | "lax",
        path: "/",
        maxAge: 8 * 60 * 60,
      };
      reply.setCookie("stc_session", token, { ...cookieOpts, httpOnly: true });

      // Cookie CSRF (double-submit): NO httpOnly, el frontend debe poder leerla
      // para reenviarla como header X-CSRF-Token en cada mutación.
      const csrfToken = crypto.randomBytes(32).toString("hex");
      reply.setCookie("stc_csrf", csrfToken, { ...cookieOpts, httpOnly: false });

      // `token` se mantiene en el body a propósito: es el mecanismo soportado de
      // Bearer auth para consumidores que no son el browser del portal (tests,
      // scripts, clientes API). El browser del portal, en cambio, ya NO lo
      // guarda en sessionStorage (ver AuthContext.tsx) — antes lo hacía como
      // fallback para el handshake WS en Vercel (que no proxea WS), lo que
      // anulaba la protección de `httpOnly` exponiendo el mismo secreto de
      // sesión a JS de la página. El portal pide un ticket de un solo uso y
      // corta duración en su lugar (`POST /portal/ws-ticket`, `wsTicketService.ts`).
      return { ok: true, token };
    },

    portalLogout: async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.clearCookie("stc_session", { path: "/" });
      reply.clearCookie("stc_csrf", { path: "/" });
      return { ok: true };
    },

    portalMe: async (request: FastifyRequest) => {
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      const token = request.cookies.stc_session;
      return { userId: user.userId, username: user.username, role: user.role, clientId: user.clientId, token };
    },

    portalWsTicket: async (request: FastifyRequest) => {
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      const ticket = await mintWsTicket(redis, { userId: user.userId, role: "portal" });
      return { ticket };
    },

    listUsers: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as FastifyRequest & { user: PortalUser }).user;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const users = await db("users")
        .leftJoin("clients", "clients.id", "users.client_id")
        .select(
          "users.id",
          "users.username",
          "users.role",
          "users.active",
          "users.client_id",
          "clients.name as client_name",
          "users.created_at",
          "users.updated_at"
        )
        .orderBy("users.username", "asc");
      return users;
    },

    createUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as FastifyRequest & { user: PortalUser }).user;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const { username, password, role, client_id } = request.body as CreateUserBody;

      if (!username || !password) {
        return reply.status(400).send({ error: "Usuario y contraseña son requeridos" });
      }

      const finalRole = role || "operator";
      // La CHECK de la migración rechazaría esto con un 23514 (500) si se dejara pasar
      // — mejor un 400 explícito acá. `client_id` sólo tiene sentido para
      // `client_viewer`; para otros roles se ignora (no queda un client_id residual).
      if (finalRole === "client_viewer" && !client_id) {
        return reply.status(400).send({ error: "Un usuario client_viewer requiere client_id" });
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
          role: finalRole,
          client_id: finalRole === "client_viewer" ? client_id : null,
          active: true,
        })
        .returning(["id", "username", "role", "active", "client_id", "created_at"]);

      await db("audit_logs").insert({
        action: "USER_CREATED",
        target_id: String(newUser.id),
        user_id: currentUser.userId !== "admin" ? currentUser.userId : null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ username: cleanUsername, role: finalRole, client_id: newUser.client_id }),
      });

      return newUser;
    },

    updateUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as FastifyRequest & { user: PortalUser }).user;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const { id } = request.params as IdParams;
      const { password, role, active, client_id } = request.body as UpdateUserBody;

      const user = await db("users").where({ id }).first();
      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      if (user.id === currentUser.userId && active === false) {
        return reply.status(400).send({ error: "No puedes desactivar tu propio usuario" });
      }

      // Mismo chequeo que en createUser: el rol resultante (nuevo si se manda, si no
      // el que ya tenía) tiene que tener client_id cuando es client_viewer, y NO
      // arrastrar uno residual cuando deja de serlo.
      const finalRole = role ?? user.role;
      const finalClientId = client_id ?? user.client_id;
      if (finalRole === "client_viewer" && !finalClientId) {
        return reply.status(400).send({ error: "Un usuario client_viewer requiere client_id" });
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (password) {
        updates.password_hash = hashPassword(password);
      }
      if (role !== undefined) {
        updates.role = role;
        updates.client_id = role === "client_viewer" ? finalClientId : null;
      } else if (client_id !== undefined) {
        updates.client_id = finalRole === "client_viewer" ? client_id : null;
      }
      if (active !== undefined) {
        updates.active = active;
      }

      const [updatedUser] = await db("users")
        .where({ id })
        .update(updates)
        .returning(["id", "username", "role", "active", "client_id", "updated_at"]);

      await db("audit_logs").insert({
        action: "USER_UPDATED",
        target_id: String(id),
        user_id: currentUser.userId !== "admin" ? currentUser.userId : null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ changes: { password_changed: !!password, role, active, client_id: updates.client_id } }),
      });

      return updatedUser;
    },

    deleteUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = (request as FastifyRequest & { user: PortalUser }).user;
      if (currentUser.role !== "admin") {
        return reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
      }
      const { id } = request.params as IdParams;

      const user = await db("users").where({ id }).first();
      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      if (user.id === currentUser.userId) {
        return reply.status(400).send({ error: "No puedes eliminar tu propio usuario" });
      }

      await db("audit_logs").insert({
        action: "USER_DELETED",
        target_id: String(id),
        user_id: currentUser.userId !== "admin" ? currentUser.userId : null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ username: user.username, role: user.role }),
      });

      await db("users").where({ id }).delete();
      return { success: true };
    },

    agentActivate: async (request: FastifyRequest, reply: FastifyReply) => {
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
    },

    agentRefresh: async (request: FastifyRequest, reply: FastifyReply) => {
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
    },

    agentVersion: async () => {
      // 1. Intentar leer de Redis
      try {
        const cached = await redis.get("stc:agent_version_metadata");
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        fastify.log.error(`Error al leer versión de Redis: ${err}`);
      }

      // 2. Intentar leer del archivo local persistentemente
      try {
        const localPath = path.join(process.cwd(), "local_settings.json");
        if (fs.existsSync(localPath)) {
          const content = fs.readFileSync(localPath, "utf-8");
          const parsed = JSON.parse(content);
          if (parsed.version && parsed.url) {
            return parsed;
          }
        }
      } catch (err) {
        fastify.log.error(`Error al leer archivo local_settings.json: ${err}`);
      }

      // 3. Fallback a variables de entorno
      return {
        version: process.env.AGENT_VERSION ?? "1.0.0",
        url: process.env.AGENT_DOWNLOAD_URL ?? null,
        hash: process.env.AGENT_HASH ?? null,
      };
    },

    updateAgentVersion: async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      if (!user) {
        return reply.status(401).send({ error: "No autenticado" });
      }
      if (user.role !== "admin") {
        return reply.status(403).send({ error: "Se requiere rol admin para modificar la versión del agente." });
      }

      const { version, url, hash } = request.body as VersionUpdateBody;

      if (!version || !url || !hash) {
        return reply.status(400).send({ error: "Campos versión, url y hash son requeridos" });
      }

      const metadata = { version, url, hash };

      // 1. Guardar en Redis
      try {
        await redis.set("stc:agent_version_metadata", JSON.stringify(metadata));
      } catch (err) {
        fastify.log.error(`Error al guardar versión en Redis: ${err}`);
      }

      // 2. Guardar en archivo local
      try {
        const localPath = path.join(process.cwd(), "local_settings.json");
        fs.writeFileSync(localPath, JSON.stringify(metadata, null, 2), "utf-8");
      } catch (err) {
        fastify.log.error(`Error al guardar versión en archivo local: ${err}`);
      }

      return { status: "success", ...metadata };
    },
  };
}
