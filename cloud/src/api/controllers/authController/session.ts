import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyTotp } from "../../../modules/two-factor/domain/totp";
import { decryptSecret } from "../../../services/cryptoService";
import crypto from "crypto";
import type Redis from "ioredis";
import type { Knex } from "knex";
import { mintWsTicket } from "../../../services/wsTicketService";
import { verifyPassword } from "../../utils/password";
import type { PortalUser } from "../../middlewares/authMiddleware";
import type { LoginBody } from "./shared";
import { JWT_PORTAL_TTL } from "./shared";

async function portalLogin(fastify: FastifyInstance, db: Knex, request: FastifyRequest, reply: FastifyReply) {
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

  // 2FA TOTP opt-in (modules/two-factor): con el flag activo, la contraseña
  // sola no alcanza. `totp_required: true` le dice al portal que muestre el
  // segundo paso SIN revelar si la contraseña era correcta a un atacante
  // sin código (el mensaje de error es el mismo genérico).
  if (user.totp_enabled) {
    const { totp_code } = request.body as LoginBody & { totp_code?: string };
    if (!totp_code) {
      return reply.status(401).send({ error: "Código de verificación requerido", totp_required: true });
    }
    if (!verifyTotp(decryptSecret(user.totp_secret), totp_code, Date.now())) {
      return reply.status(401).send({ error: "Credenciales inválidas", totp_required: true });
    }
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
}

async function portalLogout(_request: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie("stc_session", { path: "/" });
  reply.clearCookie("stc_csrf", { path: "/" });
  return { ok: true };
}

async function portalMe(request: FastifyRequest) {
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  const token = request.cookies.stc_session;
  return { userId: user.userId, username: user.username, role: user.role, clientId: user.clientId, token };
}

async function portalWsTicket(redis: Redis, request: FastifyRequest) {
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  const ticket = await mintWsTicket(redis, { userId: user.userId, role: "portal" });
  return { ticket };
}

export function createAuthSessionHandlers(fastify: FastifyInstance, db: Knex, redis: Redis) {
  return {
    portalLogin: (request: FastifyRequest, reply: FastifyReply) => portalLogin(fastify, db, request, reply),
    portalLogout: (request: FastifyRequest, reply: FastifyReply) => portalLogout(request, reply),
    portalMe: (request: FastifyRequest) => portalMe(request),
    portalWsTicket: (request: FastifyRequest) => portalWsTicket(redis, request),
  };
}
