import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { SubmitFeedbackUseCase } from "../application/use-cases/submit-feedback";
import { ListFeedbackUseCase } from "../application/use-cases/list-feedback";
import { UpdateFeedbackStatusUseCase } from "../application/use-cases/update-feedback-status";
import { KnexAuditLogWriter } from "../infrastructure/database/knex-audit-log-writer";
import { KnexFeedbackRepository } from "../infrastructure/database/knex-feedback-repository";
import { KnexIdentityResolver } from "../infrastructure/database/knex-identity-resolver";
import { createFeedbackController } from "./feedback-controller";
import { submitFeedbackSchema, updateStatusSchema } from "./feedback-schemas";

function buildUseCases(db: Knex) {
  const feedbackRepository = new KnexFeedbackRepository(db);
  const identityResolver = new KnexIdentityResolver(db);
  const auditLogWriter = new KnexAuditLogWriter(db);

  return {
    submit: new SubmitFeedbackUseCase(feedbackRepository, identityResolver, auditLogWriter),
    list: new ListFeedbackUseCase(feedbackRepository),
    updateStatus: new UpdateFeedbackStatusUseCase(feedbackRepository, identityResolver, auditLogWriter),
  };
}

export function registerFeedbackRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createFeedbackController(fastify, buildUseCases(db));

  fastify.post("/api/v1/feedback", { preHandler: portalAuth, schema: submitFeedbackSchema, handler: ctrl.submit });
  fastify.get("/api/v1/feedback", { preHandler: portalAuth, handler: ctrl.list });
  fastify.put("/api/v1/feedback/:id/status", {
    preHandler: portalAuth,
    schema: updateStatusSchema,
    handler: ctrl.updateStatus,
  });
}
