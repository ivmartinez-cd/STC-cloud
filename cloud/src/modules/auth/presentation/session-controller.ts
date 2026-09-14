import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import type Redis from "ioredis";
import type { Knex } from "knex";
import { mintWsTicket } from "../../../services/wsTicketService";
import { getClientIp } from "../../../api/utils/ip";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import type { LoginBody } from "../domain/entities/auth-dtos";
import { JWT_PORTAL_TTL, JWT_PORTAL_REMEMBER_TTL } from "../domain/entities/auth-dtos";
import { KnexUserRepository } from "../infrastructure/database/knex-user-repository";
import { KnexTwoFactorGateway } from "../infrastructure/adapters/knex-two-factor-gateway";
import { KnexLoginAuditGateway } from "../infrastructure/adapters/knex-login-audit-gateway";
import { LoginUseCase } from "../application/use-cases/login-use-case";
import { sendIfAuthError } from "./auth-error-mapping";

async function portalLogin(fastify: FastifyInstance, db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { username, password, remember, totp_code } = request.body as LoginBody;
  if (!username || !password) {
    return reply.status(400).send({ error: "Usuario y contraseña son requeridos" });
  }

  const ip = getClientIp(request);
  const login = new LoginUseCase(
    new KnexUserRepository(db),
    new KnexLoginAuditGateway(db, ip),
    new KnexTwoFactorGateway(db)
  );

  let result;
  try {
    result = await login.execute(username, password, totp_code);
  } catch (err) {
    if (sendIfAuthError(reply, err)) return reply;
    throw err;
  }

  const { user, totpEnrollmentRequired } = result;
  const token = fastify.jwt.sign(
    { role: "portal", userId: user.id },
    { expiresIn: remember ? JWT_PORTAL_REMEMBER_TTL : JWT_PORTAL_TTL }
  );
  const isProd = process.env.NODE_ENV === "production";
  // `lax` por defecto: el portal y la API se sirven desde el mismo dominio
  // (nginx). `none` sólo si alguien lo pide (`COOKIE_SAMESITE=none`, portal en
  // otro dominio): con `none` la cookie viajaba en un WebSocket abierto desde
  // cualquier sitio ajeno (auditoría de seguridad, 14/09/2026).
  const sameSite = (process.env.COOKIE_SAMESITE === "none" ? "none" : "lax") as "none" | "lax";
  const cookieOpts = {
    secure: isProd,
    sameSite,
    path: "/",
    maxAge: remember ? 30 * 24 * 60 * 60 : 8 * 60 * 60,
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
  return { ok: true, token, totp_enrollment_required: totpEnrollmentRequired };
}

async function portalLogout(_request: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie("stc_session", { path: "/" });
  reply.clearCookie("stc_csrf", { path: "/" });
  return { ok: true };
}

async function portalMe(db: Knex, request: FastifyRequest) {
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  // Sin `token` en la respuesta: devolvía el JWT de la cookie `httpOnly`, o sea
  // que cualquier script en la página podía leerlo con un fetch a /me y la
  // protección de la cookie no valía nada. El portal nunca lo usó (auditoría
  // de seguridad, 14/09/2026).
  // Fase 6.3: releer el flag real (PortalUser no lo carga; una consulta barata
  // en un endpoint de baja frecuencia).
  const row = await new KnexUserRepository(db).findTotpFlags(user.userId);
  const totpEnrollmentRequired = !!row && row.totp_required === true && row.totp_enabled !== true;
  return { userId: user.userId, username: user.username, role: user.role, clientId: user.clientId, totp_enrollment_required: totpEnrollmentRequired };
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
    portalMe: (request: FastifyRequest) => portalMe(db, request),
    portalWsTicket: (request: FastifyRequest) => portalWsTicket(redis, request),
  };
}
