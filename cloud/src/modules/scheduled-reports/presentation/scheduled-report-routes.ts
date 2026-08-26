import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { KnexScheduledReportRepository } from "../infrastructure/database/knex-scheduled-report-repository";
import { KnexReportRenderer } from "../infrastructure/renderers/knex-report-renderer";
import { SmtpReportMailer } from "../infrastructure/mail/smtp-report-mailer";
import { createScheduledReportController } from "./scheduled-report-controller";
import {
  createScheduledReportSchema,
  idParamSchema,
  updateScheduledReportSchema,
} from "./scheduled-report-schemas";

/**
 * Informes guardados/programados (Fase 4.1 del gap analysis vs HP SDS).
 * Ninguna ruta está en CLIENT_VIEWER_ROUTES: deny-by-default deja esto solo
 * para admin/operator, mismo criterio que /audit-logs.
 */
export function registerScheduledReportRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createScheduledReportController({
    repo: new KnexScheduledReportRepository(db),
    renderer: new KnexReportRenderer(db),
    mailer: new SmtpReportMailer(db),
  });

  const base = "/api/v1/scheduled-reports";
  fastify.get(base, { preHandler: portalAuth, handler: ctrl.list });
  fastify.get(`${base}/templates`, { preHandler: portalAuth, handler: ctrl.templates });
  fastify.post(base, { preHandler: portalAuth, schema: createScheduledReportSchema, handler: ctrl.create });
  fastify.put(`${base}/:id`, { preHandler: portalAuth, schema: updateScheduledReportSchema, handler: ctrl.update });
  fastify.delete(`${base}/:id`, { preHandler: portalAuth, schema: idParamSchema, handler: ctrl.remove });
  fastify.post(`${base}/:id/run`, { preHandler: portalAuth, schema: idParamSchema, handler: ctrl.runNow });
  fastify.get(`${base}/:id/download`, { preHandler: portalAuth, schema: idParamSchema, handler: ctrl.download });
}
