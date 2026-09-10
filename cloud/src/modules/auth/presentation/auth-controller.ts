import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../agents";
import { createAuthSessionHandlers } from "./session-controller";
import { createAuthUserHandlers } from "./users-controller";
import { createAuthAgentHandlers } from "./agent-auth-controller";
import { createAuthAgentVersionHandlers } from "./agent-version-controller";
import { createLoginStatsHandler } from "./login-stats-controller";
import { KnexAgentReleaseRepository } from "../../agents/infrastructure/database/knex-agent-release-repository";

/**
 * Controller de autenticación (portal + agentes) y usuarios (Fase 2 de
 * docs/dev/ARCHITECTURE_MIGRATION_PLAN.md — dividido desde un solo archivo de
 * 385 líneas; migrado a módulo con capas completas en la tanda 2026-08-27).
 * Mismo objeto de handlers que devolvía el archivo original; ningún import
 * externo cambia.
 */
export function createAuthController(fastify: FastifyInstance, db: Knex, redis: Redis, agentService: AgentService) {
  const agentReleases = new KnexAgentReleaseRepository(db);
  return {
    ...createAuthSessionHandlers(fastify, db, redis),
    ...createAuthUserHandlers(db),
    ...createAuthAgentHandlers(fastify, agentService),
    ...createAuthAgentVersionHandlers(fastify, agentReleases),
    ...createLoginStatsHandler(db, redis),
  };
}
