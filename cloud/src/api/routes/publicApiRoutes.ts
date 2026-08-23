import { FastifyInstance, FastifyRequest } from "fastify";
import { Knex } from "knex";
import { createPublicApiController } from "../controllers/publicApiController";
import type { AuthHook, ApiKeyClient } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";

const putWebhookSchema = {
  body: {
    type: "object",
    properties: {
      url: { type: "string", maxLength: 500 },
      events: { type: "array", items: { type: "string" }, maxItems: 3 },
      active: { type: "boolean" },
      regenerate_secret: { type: "boolean" },
    },
  },
};

/** Rate-limit por API key (no por IP compartida — un ERP legítimo y un key filtrado desde la misma red no deben compartir cupo). */
function apiKeyRateLimitKey(request: FastifyRequest): string {
  const apiKeyId = (request as FastifyRequest & { apiKeyClient?: ApiKeyClient }).apiKeyClient?.apiKeyId;
  return apiKeyId ? `apikey:${apiKeyId}` : getClientIp(request);
}

/**
 * API pública de integración ERP (Fase 2 del gap analysis) — prefijo
 * `/api/v1/public/`, autenticada por `apiKeyAuth` (header `X-Api-Key`, no
 * JWT). Límite propio de 60/min por key, más estricto que el global de
 * 100/min por IP (que no protege contra una key comprometida reusada desde
 * la misma red del ERP legítimo).
 */
export function registerPublicApiRoutes(fastify: FastifyInstance, db: Knex, apiKeyAuth: AuthHook) {
  const ctrl = createPublicApiController(db);
  const rateLimit = { max: 60, timeWindow: "1 minute", keyGenerator: apiKeyRateLimitKey };

  fastify.get("/api/v1/public/devices", {
    preHandler: apiKeyAuth,
    config: { rateLimit },
    handler: ctrl.listDevices,
  });

  fastify.get("/api/v1/public/devices/:id/readings", {
    preHandler: apiKeyAuth,
    config: { rateLimit },
    handler: ctrl.getDeviceReadings,
  });

  fastify.get("/api/v1/public/alerts", {
    preHandler: apiKeyAuth,
    config: { rateLimit },
    handler: ctrl.listAlerts,
  });

  fastify.get("/api/v1/public/reports/closures", {
    preHandler: apiKeyAuth,
    config: { rateLimit },
    handler: ctrl.listReportClosures,
  });

  fastify.get("/api/v1/public/reports/closures/:id", {
    preHandler: apiKeyAuth,
    config: { rateLimit },
    handler: ctrl.getReportClosure,
  });

  fastify.get("/api/v1/public/webhook", {
    preHandler: apiKeyAuth,
    config: { rateLimit },
    handler: ctrl.getWebhook,
  });

  fastify.put("/api/v1/public/webhook", {
    preHandler: apiKeyAuth,
    schema: putWebhookSchema,
    config: { rateLimit },
    handler: ctrl.putWebhook,
  });
}
