import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../../modules/agents";
import { createAuthSessionHandlers } from "./session";
import { createAuthUserHandlers } from "./users";
import { createAuthAgentHandlers } from "./agent-auth";
import { createAuthAgentVersionHandlers } from "./agent-version";
import { createLoginStatsHandler } from "./login-stats";

/**
 * Controller de autenticación (portal + agentes) y usuarios (Fase 2 de
 * docs/dev/ARCHITECTURE_MIGRATION_PLAN.md — dividido desde un solo archivo de
 * 385 líneas). Mismo objeto de handlers que devolvía el archivo original;
 * ningún import externo cambia.
 */
export function createAuthController(fastify: FastifyInstance, db: Knex, redis: Redis, agentService: AgentService) {
  return {
    ...createAuthSessionHandlers(fastify, db, redis),
    ...createAuthUserHandlers(db),
    ...createAuthAgentHandlers(fastify, agentService),
    ...createAuthAgentVersionHandlers(fastify, redis),
    ...createLoginStatsHandler(db, redis),
  };
}
