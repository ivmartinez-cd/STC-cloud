import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { ClosePeriodUseCase } from "../application/use-cases/close-period";
import { ExportClosureUseCase } from "../application/use-cases/export-closure";
import { GetClosureUseCase } from "../application/use-cases/get-closure";
import { ListClosuresUseCase } from "../application/use-cases/list-closures";
import { PreviewPeriodUseCase } from "../application/use-cases/preview-period";
import { ReopenPeriodUseCase } from "../application/use-cases/reopen-period";
import { KnexPeriodUsageQuery } from "../infrastructure/database/knex-period-usage-query";
import { KnexReportClosureRepository } from "../infrastructure/database/knex-report-closure-repository";
import { KnexReportUnitOfWork } from "../infrastructure/database/knex-report-unit-of-work";
import { ExcelJsClosureXlsxRenderer } from "../infrastructure/export/closure-xlsx-renderer";
import { PdfkitClosureRenderer } from "../infrastructure/export/closure-pdf-renderer";
import { BullmqReportDeliveryEnqueuer } from "../infrastructure/queue/bullmq-report-delivery-enqueuer";
import { createReportController, type ReportUseCases } from "./report-controller";

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

function buildUseCases(db: Knex): ReportUseCases {
  const closures = new KnexReportClosureRepository(db);
  const unitOfWork = new KnexReportUnitOfWork(db);
  return {
    preview: new PreviewPeriodUseCase(new KnexPeriodUsageQuery(db)),
    close: new ClosePeriodUseCase(unitOfWork, new BullmqReportDeliveryEnqueuer()),
    reopen: new ReopenPeriodUseCase(unitOfWork),
    list: new ListClosuresUseCase(closures),
    get: new GetClosureUseCase(closures),
    export: new ExportClosureUseCase(closures, new ExcelJsClosureXlsxRenderer(), new PdfkitClosureRenderer()),
  };
}

export function registerReportRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createReportController(buildUseCases(db));

  fastify.get("/api/v1/clients/:id/reports/preview", { preHandler: portalAuth, schema: previewSchema, handler: ctrl.previewPeriod });
  fastify.get("/api/v1/clients/:id/reports", { preHandler: portalAuth, handler: ctrl.listClosures });
  fastify.get("/api/v1/clients/:id/reports/:closureId", { preHandler: portalAuth, handler: ctrl.getClosure });
  fastify.get("/api/v1/clients/:id/reports/:closureId/export.csv", { preHandler: portalAuth, handler: ctrl.exportCsv });
  fastify.get("/api/v1/clients/:id/reports/:closureId/export.xlsx", { preHandler: portalAuth, handler: ctrl.exportXlsx });
  fastify.get("/api/v1/clients/:id/reports/:closureId/export.pdf", { preHandler: portalAuth, handler: ctrl.exportPdf });

  // No se agregan a CLIENT_VIEWER_ROUTES (rolePolicy.ts) — deny-by-default alcanza
  // para que un client_viewer reciba 403 acá, mismo criterio que
  // PUT /clients/:id y PUT /alerts/:id.
  fastify.post("/api/v1/clients/:id/reports/close", { preHandler: portalAuth, schema: closeSchema, handler: ctrl.closePeriodHandler });
  fastify.post("/api/v1/clients/:id/reports/:closureId/reopen", { preHandler: portalAuth, schema: reopenSchema, handler: ctrl.reopenPeriodHandler });
}
