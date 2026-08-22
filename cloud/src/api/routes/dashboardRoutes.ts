import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { AgentService } from "../../services/agentService";
import { createDashboardController } from "../controllers/dashboardController";
import type { AuthHook } from "../middlewares/authMiddleware";

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

export function registerDashboardRoutes(
  fastify: FastifyInstance,
  db: Knex,
  agentService: AgentService,
  portalAuth: AuthHook
) {
  const ctrl = createDashboardController(db, agentService);

  fastify.get("/api/v1/dashboard", { preHandler: portalAuth, handler: ctrl.getDashboard });

  fastify.get("/api/v1/search", { preHandler: portalAuth, handler: ctrl.globalSearch });

  fastify.get("/api/v1/alerts", { preHandler: portalAuth, handler: ctrl.getAlerts });

  // No se agrega a CLIENT_VIEWER_ROUTES (rolePolicy.ts): con el gate de RBAC ya
  // deny-by-default por ruta, eso alcanza para que un client_viewer reciba 403 acá
  // sin tocar el allowlist ni el assert de arranque — confirmado en la pasada de
  // RBAC (mismo criterio que `PUT /agents/:id/config`).
  fastify.put("/api/v1/alerts/:id", {
    preHandler: portalAuth,
    schema: updateAlertSchema,
    handler: ctrl.updateAlert,
  });
}
