import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { AgentService } from "../../agents";
import { createDashboardController } from "./dashboard-controller";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";

export function registerDashboardRoutes(
  fastify: FastifyInstance,
  db: Knex,
  agentService: AgentService,
  portalAuth: AuthHook
) {
  const ctrl = createDashboardController(db, agentService);

  fastify.get("/api/v1/dashboard", { preHandler: portalAuth, handler: ctrl.getDashboard });

  fastify.get("/api/v1/search", { preHandler: portalAuth, handler: ctrl.globalSearch });
}
