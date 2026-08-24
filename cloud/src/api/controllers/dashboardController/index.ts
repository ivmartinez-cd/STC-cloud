import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../../services/agentService";
import { createDashboardHandlers } from "./dashboard";
import { createDashboardAlertReadHandlers } from "./alerts-reads";
import { createDashboardAlertMutationHandlers } from "./alerts-mutations";

/**
 * Controller del dashboard + alertas (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 600 líneas). Mismo objeto de handlers
 * que devolvía el archivo original; ningún import externo cambia.
 */
export function createDashboardController(db: Knex, agentService: AgentService, redis: Redis) {
  return {
    ...createDashboardHandlers(db, agentService, redis),
    ...createDashboardAlertReadHandlers(db),
    ...createDashboardAlertMutationHandlers(db),
  };
}
