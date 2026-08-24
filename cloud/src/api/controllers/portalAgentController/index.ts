import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../../services/agentService";
import { createPortalAgentReadHandlers } from "./reads";
import { createPortalAgentLogHandlers } from "./logs";
import { createPortalAgentLifecycleHandlers } from "./lifecycle";
import { createPortalAgentConfigHandlers } from "./config";
import { createPortalAgentRemoteHandlers } from "./remote";

/**
 * Controller de agentes del portal (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 610 líneas). Mismo objeto de handlers
 * que devolvía el archivo original; ningún import externo cambia.
 */
export function createPortalAgentController(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  return {
    ...createPortalAgentReadHandlers(db, agentService),
    ...createPortalAgentLogHandlers(agentService),
    ...createPortalAgentLifecycleHandlers(fastify, db, redis, agentService),
    ...createPortalAgentConfigHandlers(agentService),
    ...createPortalAgentRemoteHandlers(fastify, db, agentService),
  };
}
