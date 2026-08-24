import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { BulkUpdateAlertsUseCase } from "../application/use-cases/bulk-update-alerts";
import { GetAlertSummaryUseCase } from "../application/use-cases/get-alert-summary";
import { ListAlertsUseCase } from "../application/use-cases/list-alerts";
import { UpdateAlertUseCase } from "../application/use-cases/update-alert";
import { KnexAlertRepository } from "../infrastructure/database/knex-alert-repository";
import { KnexAlertUnitOfWork } from "../infrastructure/database/knex-alert-unit-of-work";
import { KnexAuditLogWriter } from "../infrastructure/database/knex-audit-log-writer";
import { createAlertController, type AlertUseCases } from "./alert-controller";

const updateAlertSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      acknowledged: { type: "boolean" },
      resolved: { type: "boolean" },
    },
  },
};

// Fase 9 del gap analysis vs HP SDS — acción en bloque sobre alertas.
const bulkUpdateAlertsSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["ids"],
    properties: {
      ids: { type: "array", minItems: 1, maxItems: 500, items: { type: "integer" } },
      acknowledged: { type: "boolean" },
      resolved: { type: "boolean" },
    },
  },
};

function buildUseCases(db: Knex): AlertUseCases {
  const alerts = new KnexAlertRepository(db);
  return {
    list: new ListAlertsUseCase(alerts),
    summary: new GetAlertSummaryUseCase(alerts),
    update: new UpdateAlertUseCase(alerts, new KnexAuditLogWriter(db)),
    bulkUpdate: new BulkUpdateAlertsUseCase(alerts, new KnexAlertUnitOfWork(db)),
  };
}

export function registerAlertRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createAlertController(buildUseCases(db));

  fastify.get("/api/v1/alerts", { preHandler: portalAuth, handler: ctrl.getAlerts });

  // Catálogo estático de clases/responders (Fase 1 del gap analysis vs HP SDS) y
  // resumen agregado — ambas en CLIENT_VIEWER_ROUTES (rolePolicy.ts): un
  // client_viewer necesita el catálogo para renderizar el filtro de su propia
  // pantalla de alertas, y el summary sólo agrega SUS alertas (scope ya aplicado
  // en el repositorio).
  fastify.get("/api/v1/alerts/classes", { preHandler: portalAuth, handler: ctrl.getAlertClasses });
  fastify.get("/api/v1/alerts/summary", { preHandler: portalAuth, handler: ctrl.getAlertSummary });

  // No se agrega a CLIENT_VIEWER_ROUTES (rolePolicy.ts): con el gate de RBAC ya
  // deny-by-default por ruta, eso alcanza para que un client_viewer reciba 403 acá
  // sin tocar el allowlist ni el assert de arranque — confirmado en la pasada de
  // RBAC (mismo criterio que `PUT /agents/:id/config`).
  fastify.put("/api/v1/alerts/:id", { preHandler: portalAuth, schema: updateAlertSchema, handler: ctrl.updateAlert });

  // Fase 9 del gap analysis vs HP SDS — mismo criterio de RBAC que el PUT single.
  fastify.post("/api/v1/alerts/bulk", { preHandler: portalAuth, schema: bulkUpdateAlertsSchema, handler: ctrl.bulkUpdateAlerts });
}
