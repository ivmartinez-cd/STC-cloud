import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import { queryDevicesCount, queryAgentsStats, queryClientsCount, queryMonthlyVolume } from "../dashboardController/dashboard-queries";

const CACHE_KEY = "stc:login_stats";
const CACHE_TTL_SECONDS = 60;

export interface LoginStats {
  clients: number;
  devices: number;
  agents: number;
  monthlyVolume: number;
}

/**
 * Tira de métricas del panel de marca en /login (handoff hifi "Login",
 * 26/08/2026): pantalla pública, sin sesión, así que reusa las mismas
 * queries globales del Panel de Control (`dashboard-queries.ts`, `cid=null`)
 * en vez de duplicar el conteo. Cacheado 60s en Redis — a diferencia del resto
 * del portal, este endpoint no tiene `preHandler` de auth y queda expuesto a
 * cualquiera que cargue /login, así que no puede pegarle a la DB en cada request.
 */
async function computeLoginStats(db: Knex): Promise<LoginStats> {
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [clientsCount, devicesCount, agentsStats, monthlyVolume] = await Promise.all([
    queryClientsCount(db, null),
    queryDevicesCount(db, null),
    queryAgentsStats(db, null, fiveMinsAgo),
    queryMonthlyVolume(db, null),
  ]);

  return {
    clients: Number(clientsCount?.c || 0),
    devices: Number(devicesCount?.c || 0),
    agents: agentsStats?.total || 0,
    monthlyVolume: Number(monthlyVolume?.total || 0),
  };
}

async function loginStats(db: Knex, redis: Redis, _request: FastifyRequest) {
  const cached = await redis.get(CACHE_KEY).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as LoginStats;
    } catch {
      // cache corrupta — recalcular abajo
    }
  }

  const stats = await computeLoginStats(db);
  await redis.set(CACHE_KEY, JSON.stringify(stats), "EX", CACHE_TTL_SECONDS).catch(() => {});
  return stats;
}

export function createLoginStatsHandler(db: Knex, redis: Redis) {
  return {
    loginStats: (request: FastifyRequest) => loginStats(db, redis, request),
  };
}
