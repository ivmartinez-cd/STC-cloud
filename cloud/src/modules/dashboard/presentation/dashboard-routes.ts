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

  // Tendencia y hotspots del rediseño del 16/09/2026 — endpoints propios y no
  // campos nuevos de `/dashboard`: se refiltran solos al cambiar el rango o la
  // pestaña del panel, sin re-pedir las cifras del titular en cada clic.
  fastify.get("/api/v1/dashboard/trend", { preHandler: portalAuth, handler: ctrl.getTrend });

  fastify.get("/api/v1/dashboard/hotspots", { preHandler: portalAuth, handler: ctrl.getHotspots });

  fastify.get("/api/v1/search", { preHandler: portalAuth, handler: ctrl.globalSearch });
}
