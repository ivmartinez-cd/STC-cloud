import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import { getClientIp } from "../../../api/utils/ip";
import { writeAudit } from "../../../services/auditService";
import { validateOfflineThresholdMinutes, type SystemSettings } from "../domain/system-settings";
import { KnexSystemSettingsRepository } from "../infrastructure/database/knex-system-settings-repository";

const updateSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      agent_offline_threshold_minutes: { type: "integer", minimum: 1, maximum: 1440 },
      device_offline_threshold_minutes: { type: "integer", minimum: 1, maximum: 1440 },
    },
  },
};

function userOf(request: FastifyRequest): PortalUser {
  return (request as FastifyRequest & { user: PortalUser }).user;
}

function toView(s: SystemSettings) {
  return {
    agent_offline_threshold_minutes: s.agentOfflineThresholdMinutes,
    device_offline_threshold_minutes: s.deviceOfflineThresholdMinutes,
  };
}

function buildGet(repo: KnexSystemSettingsRepository) {
  return async () => toView(await repo.get());
}

/** Sólo admin puede cambiar un ajuste que afecta a TODA la flota — mismo criterio que `updateAgentVersion` (`authController/agent-version.ts`). */
function buildUpdate(db: Knex, repo: KnexSystemSettingsRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = userOf(request);
    if (user.role !== "admin") {
      return reply.status(403).send({ error: "Se requiere rol admin para modificar ajustes del sistema" });
    }

    const body = request.body as { agent_offline_threshold_minutes?: number; device_offline_threshold_minutes?: number };
    if (body.agent_offline_threshold_minutes === undefined && body.device_offline_threshold_minutes === undefined) {
      return reply.status(400).send({ error: "Nada para actualizar" });
    }

    const patch: Partial<SystemSettings> = {};
    try {
      if (body.agent_offline_threshold_minutes !== undefined) {
        patch.agentOfflineThresholdMinutes = validateOfflineThresholdMinutes(body.agent_offline_threshold_minutes);
      }
      if (body.device_offline_threshold_minutes !== undefined) {
        patch.deviceOfflineThresholdMinutes = validateOfflineThresholdMinutes(body.device_offline_threshold_minutes);
      }
    } catch (e) {
      return reply.status(400).send({ error: (e as Error).message });
    }

    const updated = await repo.update(patch, user.userId);
    await writeAudit(db, {
      action: "SYSTEM_SETTINGS_UPDATED",
      userId: user.userId,
      ip: getClientIp(request),
      metadata: toView(updated),
    });
    return toView(updated);
  };
}

/**
 * Ajustes globales del sistema (R9 del gap analysis vs HP SDS). Fuera de
 * `CLIENT_VIEWER_ROUTES` — no es un dato de un cliente puntual, es
 * operación de toda la plataforma.
 */
export function registerSystemSettingsRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const repo = new KnexSystemSettingsRepository(db);
  const base = "/api/v1/settings/system";
  fastify.get(base, { preHandler: portalAuth, handler: buildGet(repo) });
  fastify.put(base, { preHandler: portalAuth, schema: updateSchema, handler: buildUpdate(db, repo) });
}
