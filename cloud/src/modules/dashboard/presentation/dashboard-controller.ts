import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../agents";
import { getScope } from "../../../api/utils/scope";
import { KnexDashboardRepository } from "../infrastructure/database/knex-dashboard-repository";
import { KnexAlertsByClassReader } from "../infrastructure/adapters/knex-alerts-by-class-reader";
import { RedisAgentVersionReader } from "../infrastructure/adapters/redis-agent-version-reader";
import { GetDashboardStatsUseCase } from "../application/use-cases/get-dashboard-stats";
import { GlobalSearchUseCase } from "../application/use-cases/global-search";

/**
 * Controller del dashboard (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 600 líneas; migrado a módulo con capas
 * completas en la tanda 2026-08-27). Las alertas que convivían acá viven en
 * `modules/alerts/` (Fase 3).
 */
export function createDashboardController(db: Knex, agentService: AgentService, redis: Redis) {
  const repo = new KnexDashboardRepository(db);
  const alertsReader = new KnexAlertsByClassReader(db);
  const agentVersionReader = new RedisAgentVersionReader(redis);
  const getDashboardStats = new GetDashboardStatsUseCase(repo, alertsReader, agentVersionReader);
  const globalSearch = new GlobalSearchUseCase(agentService);

  return {
    getDashboard: (request: FastifyRequest) => getDashboardStats.execute(getScope(request)),
    globalSearch: (request: FastifyRequest) => {
      const { q } = request.query as { q?: string };
      const scope = getScope(request);
      return globalSearch.execute(q, scope.kind === "client" ? scope.id : null);
    },
  };
}
