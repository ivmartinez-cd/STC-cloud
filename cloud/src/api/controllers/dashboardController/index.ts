import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../../services/agentService";
import { createDashboardHandlers } from "./dashboard";

/**
 * Controller del dashboard (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 600 líneas). Las alertas que convivían
 * acá viven ahora en `modules/alerts/` (Fase 3).
 */
export function createDashboardController(db: Knex, agentService: AgentService, redis: Redis) {
  return createDashboardHandlers(db, agentService, redis);
}
