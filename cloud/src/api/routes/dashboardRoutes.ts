import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { AgentService } from "../../services/agentService";
import { createDashboardController } from "../controllers/dashboardController";

export function registerDashboardRoutes(
  fastify: FastifyInstance,
  db: Knex,
  agentService: AgentService,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createDashboardController(db, agentService);

  fastify.get("/api/v1/dashboard", { preHandler: portalAuth, handler: ctrl.getDashboard });

  fastify.get("/api/v1/search", { preHandler: portalAuth, handler: ctrl.globalSearch });

  fastify.get("/api/v1/alerts", { preHandler: portalAuth, handler: ctrl.getAlerts });
}
