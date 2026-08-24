import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { ListAuditActionsUseCase } from "../application/use-cases/list-audit-actions";
import { ListAuditLogsUseCase } from "../application/use-cases/list-audit-logs";
import { KnexAuditLogRepository } from "../infrastructure/database/knex-audit-log-repository";
import { createAuditController } from "./audit-controller";

function buildUseCases(db: Knex) {
  const auditLogRepository = new KnexAuditLogRepository(db);
  return {
    listLogs: new ListAuditLogsUseCase(auditLogRepository),
    listActions: new ListAuditActionsUseCase(auditLogRepository),
  };
}

/**
 * Feed de "Movimientos y cambios" (Fase 3 del gap analysis vs HP SDS) sobre
 * `audit_logs`. Deliberadamente NO en `CLIENT_VIEWER_ROUTES` (rolePolicy.ts):
 * `metadata` es jsonb libre sin schema que acote su contenido futuro — mismo
 * criterio ya usado para excluir `/agents/:id/logs`. admin/operator solamente,
 * 403 por deny-by-default.
 */
export function registerAuditRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createAuditController(buildUseCases(db));

  fastify.get("/api/v1/audit-logs", { preHandler: portalAuth, handler: ctrl.getAuditLogs });
  fastify.get("/api/v1/audit-logs/actions", { preHandler: portalAuth, handler: ctrl.getAuditActions });
}
