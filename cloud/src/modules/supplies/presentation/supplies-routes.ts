import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createSuppliesController } from "./supplies-controller";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";

/**
 * Fase 8 del gap analysis vs HP SDS — vista de flota de consumibles. Ambas
 * en `CLIENT_VIEWER_ROUTES` (rolePolicy.ts): son sólo lectura, scopeadas por
 * cliente igual que `GET /clients/:id/devices`.
 */
export function registerSuppliesRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createSuppliesController(db);

  fastify.get("/api/v1/supplies", { preHandler: portalAuth, handler: ctrl.listSupplies });
  fastify.get("/api/v1/supplies/summary", { preHandler: portalAuth, handler: ctrl.getSuppliesSummary });
}
