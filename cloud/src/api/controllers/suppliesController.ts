import { FastifyRequest } from "fastify";
import { Knex } from "knex";
import { getScope } from "../utils/scope";
import { fleetSupplies, suppliesSummary, type SupplyKind } from "../../services/suppliesService";

interface SuppliesQuery {
  client_id?: string;
  agent_id?: string;
  kind?: SupplyKind;
  max_percentage?: string;
  max_days?: string;
  limit?: string;
  offset?: string;
}

// Memoización simple en proceso, keyed por scope — `suppliesSummary` recorre
// TODA la flota viva (hasta el techo de seguridad) para armar el top-5, así
// que un polling ingenuo del dashboard no debería recalcularlo en cada
// request. Mismo criterio que `auditController.ts` (`GET /audit-logs/actions`).
const summaryCache = new Map<string, { at: number; data: unknown }>();
const SUMMARY_CACHE_MS = 60_000;

/**
 * Fase 8 del gap analysis vs HP SDS — vista de flota de consumibles.
 * `client_viewer` siempre queda forzado a su propio cliente (nunca puede
 * pisar `scope.id` con un `client_id` de query ajeno) — mismo criterio que
 * `dashboardController.getDashboard`.
 */
export function createSuppliesController(db: Knex) {
  return {
    listSupplies: async (request: FastifyRequest) => {
      const scope = getScope(request);
      const { client_id, agent_id, kind, max_percentage, max_days, limit, offset } = request.query as SuppliesQuery;
      const clientId = scope.kind === "client" ? scope.id : (client_id || null);
      return fleetSupplies(db, {
        clientId,
        agentId: agent_id || null,
        kind: kind || null,
        maxPercentage: max_percentage !== undefined ? Number(max_percentage) : null,
        maxDays: max_days !== undefined ? Number(max_days) : null,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    },

    getSuppliesSummary: async (request: FastifyRequest) => {
      const scope = getScope(request);
      const { client_id, agent_id } = request.query as SuppliesQuery;
      const clientId = scope.kind === "client" ? scope.id : (client_id || null);
      const cacheKey = `${clientId ?? "all"}:${agent_id ?? "all"}`;
      const cached = summaryCache.get(cacheKey);
      if (cached && Date.now() - cached.at < SUMMARY_CACHE_MS) return cached.data;
      const data = await suppliesSummary(db, { clientId, agentId: agent_id || null });
      summaryCache.set(cacheKey, { at: Date.now(), data });
      return data;
    },
  };
}
