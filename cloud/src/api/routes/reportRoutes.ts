import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createReportController } from "../controllers/reportController";
import type { AuthHook } from "../middlewares/authMiddleware";

const previewSchema = {
  querystring: {
    type: "object",
    required: ["period"],
    properties: {
      period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
    },
  },
};

const closeSchema = {
  body: {
    type: "object",
    required: ["period"],
    additionalProperties: false,
    properties: {
      period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
    },
  },
};

const reopenSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", maxLength: 500 },
    },
  },
};

export function registerReportRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createReportController(db);

  fastify.get("/api/v1/clients/:id/reports/preview", {
    preHandler: portalAuth,
    schema: previewSchema,
    handler: ctrl.previewPeriod,
  });

  fastify.get("/api/v1/clients/:id/reports", { preHandler: portalAuth, handler: ctrl.listClosures });

  fastify.get("/api/v1/clients/:id/reports/:closureId", {
    preHandler: portalAuth,
    handler: ctrl.getClosure,
  });

  fastify.get("/api/v1/clients/:id/reports/:closureId/export.csv", {
    preHandler: portalAuth,
    handler: ctrl.exportCsv,
  });

  fastify.get("/api/v1/clients/:id/reports/:closureId/export.xlsx", {
    preHandler: portalAuth,
    handler: ctrl.exportXlsx,
  });

  // No se agregan a CLIENT_VIEWER_ROUTES (rolePolicy.ts) — deny-by-default alcanza
  // para que un client_viewer reciba 403 acá, mismo criterio que
  // PUT /clients/:id y PUT /alerts/:id.
  fastify.post("/api/v1/clients/:id/reports/close", {
    preHandler: portalAuth,
    schema: closeSchema,
    handler: ctrl.closePeriodHandler,
  });

  fastify.post("/api/v1/clients/:id/reports/:closureId/reopen", {
    preHandler: portalAuth,
    schema: reopenSchema,
    handler: ctrl.reopenPeriodHandler,
  });
}
