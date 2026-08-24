import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyTotp } from "../../../modules/two-factor/domain/totp";
import { looksLikeRecoveryCode } from "../../../modules/two-factor/domain/recovery-codes";
import { KnexRecoveryCodeRepository } from "../../../modules/two-factor/infrastructure/database/knex-recovery-code-repository";
import { writeAudit } from "../../../services/auditService";
import { decryptSecret } from "../../../services/cryptoService";
import crypto from "crypto";
import type Redis from "ioredis";
import type { Knex } from "knex";
import { mintWsTicket } from "../../../services/wsTicketService";
import { verifyPassword } from "../../utils/password";
import { getClientIp } from "../../utils/ip";
import type { PortalUser } from "../../middlewares/authMiddleware";
import type { LoginBody } from "./shared";
import { JWT_PORTAL_TTL } from "./shared";

/**
 * R5 del gap analysis vs HP SDS ("Audit logs ausentes para: ... logins"):
 * único punto de auditoría de intentos de login, éxito y falla, con el
 * MOTIVO de la falla en `metadata` (nunca la contraseña). `targetId`/`userId`
 * quedan null cuando el usuario no existe — igual se registra el username
 * intentado en `metadata` para poder investigar fuerza bruta por cuenta.
 */
async function auditLoginFailure(db: Knex, request: FastifyRequest, username: string, reason: string, user?: { id: string }) {
  await writeAudit(db, {
    action: "USER_LOGIN_FAILED",
    targetId: user?.id ?? null,
    userId: user?.id ?? null,
    ip: getClientIp(request),
    metadata: { username, reason },
  });
}

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
    await auditLoginFailure(db, request, cleanUsername, "unknown_user");
    return reply.status(401).send({ error: "Credenciales inválidas" });
  }

  if (!user.active) {
    await auditLoginFailure(db, request, cleanUsername, "disabled", user);
    return reply.status(401).send({ error: "El usuario está desactivado" });
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    await auditLoginFailure(db, request, cleanUsername, "bad_password", user);
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
    if (looksLikeRecoveryCode(totp_code)) {
      // Fase 6.2: un código de recuperación de un solo uso vale como segundo
      // factor (consumo atómico + auditoría — el usuario perdió el teléfono).
      const consumed = await new KnexRecoveryCodeRepository(db).consume(user.id, totp_code);
      if (!consumed) {
        await auditLoginFailure(db, request, cleanUsername, "bad_recovery_code", user);
        return reply.status(401).send({ error: "Credenciales inválidas", totp_required: true });
      }
      await writeAudit(db, { action: "USER_2FA_RECOVERY_USED", targetId: user.id, userId: user.id });
    } else if (!verifyTotp(decryptSecret(user.totp_secret), totp_code, Date.now())) {
      await auditLoginFailure(db, request, cleanUsername, "bad_totp", user);
      return reply.status(401).send({ error: "Credenciales inválidas", totp_required: true });
    }
  }

  await writeAudit(db, {
    action: "USER_LOGIN_SUCCESS",
    targetId: user.id,
    userId: user.id,
    ip: getClientIp(request),
  });

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
  // Fase 6.3: si el admin exige 2FA y el usuario aún no enroló, el portal
  // debe llevarlo directo al enrolamiento (el middleware ya bloquea el resto).
  const totpEnrollmentRequired = user.totp_required === true && user.totp_enabled !== true;
  return { ok: true, token, totp_enrollment_required: totpEnrollmentRequired };
}

async function portalLogout(_request: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie("stc_session", { path: "/" });
  reply.clearCookie("stc_csrf", { path: "/" });
  return { ok: true };
}

async function portalMe(db: Knex, request: FastifyRequest) {
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  const token = request.cookies.stc_session;
  // Fase 6.3: releer el flag real (PortalUser no lo carga; una consulta barata
  // en un endpoint de baja frecuencia).
  const row = await db("users").where({ id: user.userId }).select("totp_required", "totp_enabled").first();
  const totpEnrollmentRequired = !!row && row.totp_required === true && row.totp_enabled !== true;
  return { userId: user.userId, username: user.username, role: user.role, clientId: user.clientId, token, totp_enrollment_required: totpEnrollmentRequired };
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
