import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import { getClientIp } from "../../../api/utils/ip";
import { writeAudit } from "../../../services/auditService";
import { _resetSmtpConfigCacheForTests, buildTransporter, resolveSmtpConfig } from "../../../services/notificationService/mailer";
import { getSettingsImpact } from "../infrastructure/database/get-settings-impact";
import {
  DEFAULT_SYSTEM_SETTINGS, SMTP_ENCRYPTIONS, validateOfflineThresholdMinutes, validateSmtpPort, validateSupplyThresholdPct,
  type SystemSettings, type SystemSettingsPatch,
} from "../domain/system-settings";
import { KnexSystemSettingsRepository } from "../infrastructure/database/knex-system-settings-repository";

const updateSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      agent_offline_threshold_minutes: { type: "integer", minimum: 1, maximum: 1440 },
      device_offline_threshold_minutes: { type: "integer", minimum: 1, maximum: 1440 },
      smtp_host: { type: ["string", "null"], maxLength: 255 },
      smtp_port: { type: ["integer", "null"], minimum: 1, maximum: 65535 },
      smtp_user: { type: ["string", "null"], maxLength: 255 },
      smtp_password: { type: ["string", "null"], maxLength: 500 },
      smtp_from: { type: ["string", "null"], maxLength: 255 },
      smtp_encryption: { type: "string", enum: [...SMTP_ENCRYPTIONS] },
      supply_threshold_warning_pct: { type: "integer", minimum: 1, maximum: 99 },
      supply_threshold_critical_pct: { type: "integer", minimum: 1, maximum: 99 },
      supply_manual_review_required: { type: "boolean" },
    },
  },
};

const testSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: { to: { type: "string", format: "email" } },
  },
};

function userOf(request: FastifyRequest): PortalUser {
  return (request as FastifyRequest & { user: PortalUser }).user;
}

function toView(s: SystemSettings) {
  return {
    agent_offline_threshold_minutes: s.agentOfflineThresholdMinutes,
    device_offline_threshold_minutes: s.deviceOfflineThresholdMinutes,
    smtp_host: s.smtpHost,
    smtp_port: s.smtpPort,
    smtp_user: s.smtpUser,
    smtp_password_set: s.smtpPasswordSet,
    smtp_from: s.smtpFrom,
    smtp_encryption: s.smtpEncryption,
    supply_threshold_warning_pct: s.supplyThresholdWarningPct,
    supply_threshold_critical_pct: s.supplyThresholdCriticalPct,
    supply_manual_review_required: s.supplyManualReviewRequired,
  };
}

function buildGet(repo: KnexSystemSettingsRepository) {
  return async () => toView(await repo.get());
}

type UpdateBody = {
  agent_offline_threshold_minutes?: number; device_offline_threshold_minutes?: number;
  smtp_host?: string | null; smtp_port?: number | null; smtp_user?: string | null; smtp_password?: string | null;
  smtp_from?: string | null; smtp_encryption?: SystemSettings["smtpEncryption"];
  supply_threshold_warning_pct?: number; supply_threshold_critical_pct?: number; supply_manual_review_required?: boolean;
};

/** Valida y arma el patch de dominio a partir del body crudo — separado de
 * `buildUpdate` por el límite de 20 líneas/función. Lanza `Error` con mensaje
 * de usuario ante cualquier valor fuera de rango. */
function toPatch(body: UpdateBody): SystemSettingsPatch {
  const patch: SystemSettingsPatch = {};
  if (body.agent_offline_threshold_minutes !== undefined) patch.agentOfflineThresholdMinutes = validateOfflineThresholdMinutes(body.agent_offline_threshold_minutes);
  if (body.device_offline_threshold_minutes !== undefined) patch.deviceOfflineThresholdMinutes = validateOfflineThresholdMinutes(body.device_offline_threshold_minutes);
  if (body.smtp_host !== undefined) patch.smtpHost = body.smtp_host?.trim() || null;
  if (body.smtp_port !== undefined) patch.smtpPort = body.smtp_port === null ? null : validateSmtpPort(body.smtp_port);
  if (body.smtp_user !== undefined) patch.smtpUser = body.smtp_user?.trim() || null;
  if (body.smtp_password !== undefined) patch.smtpPassword = body.smtp_password?.trim() || null;
  if (body.smtp_from !== undefined) patch.smtpFrom = body.smtp_from?.trim() || null;
  if (body.smtp_encryption !== undefined) patch.smtpEncryption = body.smtp_encryption;
  if (body.supply_threshold_warning_pct !== undefined) patch.supplyThresholdWarningPct = validateSupplyThresholdPct(body.supply_threshold_warning_pct);
  if (body.supply_threshold_critical_pct !== undefined) patch.supplyThresholdCriticalPct = validateSupplyThresholdPct(body.supply_threshold_critical_pct);
  if (body.supply_manual_review_required !== undefined) patch.supplyManualReviewRequired = body.supply_manual_review_required;
  return patch;
}

async function applyUpdate(db: Knex, repo: KnexSystemSettingsRepository, patch: SystemSettingsPatch, request: FastifyRequest, user: PortalUser) {
  const updated = await repo.update(patch, user.userId);
  _resetSmtpConfigCacheForTests(); // el cache de 60s del mailer no debe servir la config vieja tras un GUARDAR
  await writeAudit(db, { action: "SYSTEM_SETTINGS_UPDATED", userId: user.userId, ip: getClientIp(request), metadata: toView(updated) });
  return toView(updated);
}

/** Sólo admin puede cambiar un ajuste que afecta a TODA la flota — mismo criterio que `updateAgentVersion` (`authController/agent-version.ts`). */
function buildUpdate(db: Knex, repo: KnexSystemSettingsRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = userOf(request);
    if (user.role !== "admin") {
      return reply.status(403).send({ error: "Se requiere rol admin para modificar ajustes del sistema" });
    }
    const body = request.body as UpdateBody;
    if (Object.keys(body).length === 0) return reply.status(400).send({ error: "Nada para actualizar" });
    try {
      return await applyUpdate(db, repo, toPatch(body), request, user);
    } catch (e) {
      return reply.status(400).send({ error: (e as Error).message });
    }
  };
}

async function runSmtpTest(config: NonNullable<Awaited<ReturnType<typeof resolveSmtpConfig>>>, to: string | undefined) {
  const transporter = buildTransporter(config);
  if (to) {
    await transporter.sendMail({
      from: config.from, to, subject: "[STC Cloud] Prueba de configuración SMTP",
      text: "Este es un email de prueba enviado desde Configuración del sistema. Si lo recibiste, el SMTP está funcionando.",
    });
  } else {
    await transporter.verify();
  }
}

/** `POST /settings/system/smtp/test` — con `to`: manda un email real de
 * prueba. Sin `to`: sólo verifica la conexión/autenticación (`transporter.
 * verify()`), sin mandar nada. Usa la config YA GUARDADA (no la del form sin
 * guardar) — "GUARDAR Y PROBAR" en el front hace `PUT` y después llama acá. */
function buildTestSmtp(db: Knex) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = userOf(request);
    if (user.role !== "admin") return reply.status(403).send({ error: "Se requiere rol admin" });
    const { to } = request.body as { to?: string };
    const config = await resolveSmtpConfig(db);
    if (!config) return reply.status(400).send({ error: "No hay servidor SMTP configurado" });
    try {
      await runSmtpTest(config, to);
      return { ok: true };
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  };
}

/** `?` de cada umbral — un valor ausente/inválido cae al default, nunca 400:
 * es de sólo-lectura y el front siempre manda los 4, esto es sólo defensivo. */
function toPositiveIntOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function buildGetImpact(db: Knex) {
  return async (request: FastifyRequest) => {
    const q = request.query as Record<string, string | undefined>;
    return getSettingsImpact(db, {
      agentOfflineThresholdMinutes: toPositiveIntOr(q.agent_offline_threshold_minutes, DEFAULT_SYSTEM_SETTINGS.agentOfflineThresholdMinutes),
      deviceOfflineThresholdMinutes: toPositiveIntOr(q.device_offline_threshold_minutes, DEFAULT_SYSTEM_SETTINGS.deviceOfflineThresholdMinutes),
      supplyThresholdWarningPct: toPositiveIntOr(q.supply_threshold_warning_pct, DEFAULT_SYSTEM_SETTINGS.supplyThresholdWarningPct),
      supplyThresholdCriticalPct: toPositiveIntOr(q.supply_threshold_critical_pct, DEFAULT_SYSTEM_SETTINGS.supplyThresholdCriticalPct),
    });
  };
}

/**
 * Ajustes globales del sistema (R9 del gap analysis vs HP SDS; SMTP y
 * umbrales de consumible sumados en el handoff hifi #3, fase 2). Fuera de
 * `CLIENT_VIEWER_ROUTES` — no es un dato de un cliente puntual, es
 * operación de toda la plataforma.
 */
export function registerSystemSettingsRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const repo = new KnexSystemSettingsRepository(db);
  const base = "/api/v1/settings/system";
  fastify.get(base, { preHandler: portalAuth, handler: buildGet(repo) });
  fastify.put(base, { preHandler: portalAuth, schema: updateSchema, handler: buildUpdate(db, repo) });
  fastify.post(`${base}/smtp/test`, { preHandler: portalAuth, schema: testSchema, handler: buildTestSmtp(db) });
  fastify.get(`${base}/impact`, { preHandler: portalAuth, handler: buildGetImpact(db) });
}
