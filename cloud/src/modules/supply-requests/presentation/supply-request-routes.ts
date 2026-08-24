import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { Queue } from "bullmq";
import Redis from "ioredis";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { KnexSupplyRequestRepository } from "../infrastructure/database/knex-supply-request-repository";
import { BullRequestNotifier } from "../infrastructure/queue/bull-request-notifier";
import { createSupplyRequestController } from "./supply-request-controller";
import {
  commentSchema,
  createRequestSchema,
  idParamSchema,
  listQuerySchema,
  settingsBodySchema,
  statsQuerySchema,
  statusChangeSchema,
} from "./supply-request-schemas";

/**
 * Pedidos de consumibles (Fase 4.2 del gap analysis vs HP SDS). Los 3 GET
 * de lectura están en CLIENT_VIEWER_ROUTES (un cliente ve sus pedidos, con
 * ownership central vía `supplyRequestIdParamMatchesScope`); las mutaciones
 * y la configuración quedan deny-by-default para admin/operator.
 */
export function registerSupplyRequestRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  // Conexión propia, mismo criterio que jobs/incidentWorker.ts.
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    retryStrategy() { return 10000; },
  });
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const notificationsQueue = new Queue("notifications-queue", { connection: redis as any });
  const ctrl = createSupplyRequestController({
    db,
    repo: new KnexSupplyRequestRepository(db),
    notifier: new BullRequestNotifier(notificationsQueue),
  });

  const base = "/api/v1/supply-requests";
  fastify.get(base, { preHandler: portalAuth, schema: listQuerySchema, handler: ctrl.list });
  fastify.get(`${base}/stats`, { preHandler: portalAuth, schema: statsQuerySchema, handler: ctrl.stats });
  fastify.get(`${base}/:id`, { preHandler: portalAuth, schema: idParamSchema, handler: ctrl.detail });
  fastify.post(base, { preHandler: portalAuth, schema: createRequestSchema, handler: ctrl.create });
  fastify.post(`${base}/:id/status`, { preHandler: portalAuth, schema: statusChangeSchema, handler: ctrl.statusChange });
  fastify.post(`${base}/:id/comments`, { preHandler: portalAuth, schema: commentSchema, handler: ctrl.comment });

  fastify.get("/api/v1/clients/:id/supply-request-settings", {
    preHandler: portalAuth, schema: idParamSchema, handler: ctrl.getSettings,
  });
  fastify.put("/api/v1/clients/:id/supply-request-settings", {
    preHandler: portalAuth, schema: { ...idParamSchema, ...settingsBodySchema }, handler: ctrl.putSettings,
  });
}
