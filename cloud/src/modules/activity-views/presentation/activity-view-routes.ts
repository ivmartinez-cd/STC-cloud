import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { KnexActivitySavedViewRepository } from "../infrastructure/database/knex-activity-saved-view-repository";
import { createActivityViewController } from "./activity-view-controller";
import { createActivityViewSchema, idParamSchema } from "./activity-view-schemas";

/**
 * "Guardar vista" en Movimientos (Fase 5 del handoff hifi #3, cierre de
 * gaps post-verificación, 26/08/2026). Vistas personales — cualquier rol
 * autenticado puede guardar/listar/borrar las SUYAS, nunca las de otro
 * operador (el repositorio ya scopea todo por `user_id`).
 */
export function registerActivityViewRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createActivityViewController(new KnexActivitySavedViewRepository(db));

  const base = "/api/v1/activity/saved-views";
  fastify.get(base, { preHandler: portalAuth, handler: ctrl.list });
  fastify.post(base, { preHandler: portalAuth, schema: createActivityViewSchema, handler: ctrl.create });
  fastify.delete(`${base}/:id`, { preHandler: portalAuth, schema: idParamSchema, handler: ctrl.remove });
}
