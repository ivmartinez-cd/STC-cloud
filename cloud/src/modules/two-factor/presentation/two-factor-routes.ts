import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { decryptSecret, encryptSecret } from "../../../services/cryptoService";
import { writeAudit } from "../../../services/auditService";
import { base32Encode, otpauthUri, verifyTotp } from "../domain/totp";
import { KnexRecoveryCodeRepository } from "../infrastructure/database/knex-recovery-code-repository";

const codeBodySchema = {
  body: {
    type: "object",
    required: ["code"],
    additionalProperties: false,
    properties: { code: { type: "string", minLength: 6, maxLength: 8 } },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function userIdOf(request: FastifyRequest): string {
  return ((request as any).user?.userId as string) ?? "";
}

async function userRow(db: Knex, userId: string) {
  return db("users").where({ id: userId }).select("id", "username", "totp_secret", "totp_enabled").first();
}

function buildStatus(db: Knex, recovery: KnexRecoveryCodeRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await userRow(db, userIdOf(request));
    const enabled = !!user?.totp_enabled;
    return reply.send({
      enabled,
      recovery_remaining: enabled && user ? await recovery.remaining(user.id) : 0,
    });
  };
}

/** Genera (o regenera) el secreto pendiente. Con 2FA ya activo → 409: primero deshabilitar con código. */
function buildSetup(db: Knex) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await userRow(db, userIdOf(request));
    if (!user) return reply.status(401).send({ error: "Sesión inválida" });
    if (user.totp_enabled) return reply.status(409).send({ error: "2FA ya está activo — deshabilitalo primero" });
    const secretBase32 = base32Encode(randomBytes(20));
    await db("users").where({ id: user.id }).update({ totp_secret: encryptSecret(secretBase32) });
    return reply.send({
      secret: secretBase32,
      otpauth_uri: otpauthUri("STC Cloud", user.username, secretBase32),
    });
  };
}

function buildEnable(db: Knex) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code: string };
    const user = await userRow(db, userIdOf(request));
    if (!user?.totp_secret) return reply.status(400).send({ error: "Primero generá el secreto (setup)" });
    if (user.totp_enabled) return reply.status(409).send({ error: "2FA ya está activo" });
    if (!verifyTotp(decryptSecret(user.totp_secret), code, Date.now())) {
      return reply.status(400).send({ error: "Código inválido" });
    }
    await db("users").where({ id: user.id }).update({ totp_enabled: true });
    // Fase 6.2: los códigos de recuperación nacen con el 2FA y se muestran UNA vez.
    const recoveryCodes = await new KnexRecoveryCodeRepository(db).regenerate(user.id);
    await writeAudit(db, { action: "USER_2FA_ENABLED", targetId: user.id, userId: user.id });
    return reply.send({ enabled: true, recovery_codes: recoveryCodes });
  };
}

/** Deshabilitar exige un código válido — una sesión robada no puede bajar el 2FA sin el teléfono. */
function buildDisable(db: Knex) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code: string };
    const user = await userRow(db, userIdOf(request));
    if (!user?.totp_enabled || !user.totp_secret) {
      return reply.status(409).send({ error: "2FA no está activo" });
    }
    if (!verifyTotp(decryptSecret(user.totp_secret), code, Date.now())) {
      return reply.status(400).send({ error: "Código inválido" });
    }
    await db("users").where({ id: user.id }).update({ totp_enabled: false, totp_secret: null });
    await new KnexRecoveryCodeRepository(db).deleteAll(user.id);
    await writeAudit(db, { action: "USER_2FA_DISABLED", targetId: user.id, userId: user.id });
    return reply.send({ enabled: false });
  };
}

/** Regenera el juego de códigos de recuperación — exige un TOTP vigente. */
function buildRegenerateRecovery(db: Knex, recovery: KnexRecoveryCodeRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code: string };
    const user = await userRow(db, userIdOf(request));
    if (!user?.totp_enabled || !user.totp_secret) {
      return reply.status(409).send({ error: "2FA no está activo" });
    }
    if (!verifyTotp(decryptSecret(user.totp_secret), code, Date.now())) {
      return reply.status(400).send({ error: "Código inválido" });
    }
    const recoveryCodes = await recovery.regenerate(user.id);
    await writeAudit(db, { action: "USER_2FA_RECOVERY_REGENERATED", targetId: user.id, userId: user.id });
    return reply.send({ recovery_codes: recoveryCodes });
  };
}

/**
 * 2FA TOTP self-service (bloque de seguridad). Las rutas van también en
 * CLIENT_VIEWER_ROUTES: proteger la propia cuenta es de todos los roles.
 */
export function registerTwoFactorRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const base = "/api/v1/portal/2fa";
  const recovery = new KnexRecoveryCodeRepository(db);
  fastify.get(`${base}/status`, { preHandler: portalAuth, handler: buildStatus(db, recovery) });
  fastify.post(`${base}/setup`, { preHandler: portalAuth, handler: buildSetup(db) });
  fastify.post(`${base}/enable`, { preHandler: portalAuth, schema: codeBodySchema, handler: buildEnable(db) });
  fastify.post(`${base}/disable`, { preHandler: portalAuth, schema: codeBodySchema, handler: buildDisable(db) });
  fastify.post(`${base}/recovery-codes`, { preHandler: portalAuth, schema: codeBodySchema, handler: buildRegenerateRecovery(db, recovery) });
}
