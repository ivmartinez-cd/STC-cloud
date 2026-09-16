import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AgentService } from "../../agents";
import { getScope } from "../../../api/utils/scope";
import { KnexDashboardRepository } from "../infrastructure/database/knex-dashboard-repository";
import { KnexAlertsByClassReader } from "../infrastructure/adapters/knex-alerts-by-class-reader";
import { KnexDashboardSnapshotRepository } from "../infrastructure/database/knex-dashboard-snapshot-repository";
import { KnexDashboardHotspotsRepository } from "../infrastructure/database/knex-dashboard-hotspots-repository";
import { PostgresAgentVersionReader } from "../infrastructure/adapters/postgres-agent-version-reader";
import { KnexAgentReleaseRepository } from "../../agents/infrastructure/database/knex-agent-release-repository";
import { GetDashboardStatsUseCase } from "../application/use-cases/get-dashboard-stats";
import { GlobalSearchUseCase } from "../application/use-cases/global-search";
import { GetDashboardTrendUseCase } from "../application/use-cases/get-dashboard-trend";
import { GetAlertHotspotsUseCase } from "../application/use-cases/get-alert-hotspots";
import { HOTSPOT_KINDS, type HotspotKind } from "../domain/entities/alert-hotspot";
import { TREND_RANGES, type TrendRange } from "../domain/entities/dashboard-snapshot";

/** Query param desconocido → el default, nunca un 400: son controles de UI. */
function pick<T extends string>(values: readonly T[], raw: unknown, fallback: T): T {
  return values.includes(raw as T) ? (raw as T) : fallback;
}

const rangeOf = (request: FastifyRequest): TrendRange =>
  pick<TrendRange>(TREND_RANGES, (request.query as { range?: string }).range, "7d");

const kindOf = (request: FastifyRequest): HotspotKind =>
  pick<HotspotKind>(HOTSPOT_KINDS, (request.query as { by?: string }).by, "device");

const queryOf = (request: FastifyRequest): string | undefined =>
  (request.query as { q?: string }).q;

/**
 * Controller del dashboard (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 600 líneas; migrado a módulo con capas
 * completas en la tanda 2026-08-27). Las alertas que convivían acá viven en
 * `modules/alerts/` (Fase 3).
 */
export function createDashboardController(db: Knex, agentService: AgentService) {
  const repo = new KnexDashboardRepository(db);
  const alertsReader = new KnexAlertsByClassReader(db);
  const agentVersionReader = new PostgresAgentVersionReader(new KnexAgentReleaseRepository(db));
  const getDashboardStats = new GetDashboardStatsUseCase(repo, alertsReader, agentVersionReader);
  const globalSearch = new GlobalSearchUseCase(agentService);
  const getTrend = new GetDashboardTrendUseCase(new KnexDashboardSnapshotRepository(db));
  const getHotspots = new GetAlertHotspotsUseCase(new KnexDashboardHotspotsRepository(db));

  return {
    getDashboard: (request: FastifyRequest) => getDashboardStats.execute(getScope(request)),
    getTrend: (request: FastifyRequest) => getTrend.execute(rangeOf(request), getScope(request)),
    getHotspots: (request: FastifyRequest) => getHotspots.execute(kindOf(request), getScope(request)),
    globalSearch: (request: FastifyRequest) => {
      const scope = getScope(request);
      return globalSearch.execute(queryOf(request), scope.kind === "client" ? scope.id : null);
    },
  };
}
