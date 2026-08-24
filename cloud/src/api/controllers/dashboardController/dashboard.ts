import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../../../services/agentService";
import { getScope } from "../../utils/scope";
import { ALERT_CLASS_LABELS, countOpenAlertsByClass, type AlertClass } from "../../../modules/alerts";
import { getPublishedAgentVersion } from "../../../services/agentVersionService";
import {
  queryDevicesCount, queryAgentsStats, queryClientsCount, queryMonthlyVolume, queryTopClients,
  queryBrandStats, queryOfflineAgents, queryNewDevicesCount, queryReadings24hCount, queryLastReadingInfo,
  queryClientsWithAlertsCount, queryDevicesUnmanagedCount, queryAgentsReportingCount, queryAgentVersionRows,
  queryDiscoveredTodayCount, queryDiscoveredYesterdayCount, queryPendingDevicesTotalCount,
  queryDevicesReportingCount, queryMovementsCounts,
} from "./dashboard-queries";

function computeDeviceTrend(devicesCount: { c?: string | number } | undefined, newDevicesCount: { c?: string | number } | undefined) {
  const total = Number(devicesCount?.c || 0);
  const added = Number(newDevicesCount?.c || 0);
  const previousTotal = total - added;
  if (added <= 0) return { total, deviceTrend: null as string | null };
  const pct = previousTotal > 0 ? Math.round((added / previousTotal) * 100) : 100;
  return { total, deviceTrend: `+${pct}% este mes` };
}

function mapAlertsByClass(rows: Array<{ alertClass: AlertClass | null; count: number }>) {
  return rows
    .filter((r): r is { alertClass: AlertClass; count: number } => r.alertClass !== null)
    .map((r) => ({ alert_class: r.alertClass, label: ALERT_CLASS_LABELS[r.alertClass] ?? r.alertClass, count: r.count }))
    .sort((a, b) => b.count - a.count);
}

async function getDashboard(db: Knex, redis: Redis, request: FastifyRequest) {
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  const scope = getScope(request);
  const cid = scope.kind === "client" ? scope.id : null;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  const [
    devicesCount, agentsStats, clientsCount, monthlyVolume, topClients, brandStats, offlineAgents,
    newDevicesCount, readings24hCount, lastReadingInfo, clientsWithAlertsCount, devicesUnmanagedCount,
    agentsReportingCount, agentVersionRows, alertsByClassRows, discoveredTodayCount, discoveredYesterdayCount,
    pendingDevicesTotalCount, publishedAgentVersion, devicesReportingCount, movementsCounts,
  ] = await Promise.all([
    queryDevicesCount(db, cid),
    queryAgentsStats(db, cid, fiveMinsAgo),
    queryClientsCount(db, cid),
    queryMonthlyVolume(db, cid),
    queryTopClients(db, cid),
    queryBrandStats(db, cid),
    queryOfflineAgents(db, cid, fiveMinsAgo),
    queryNewDevicesCount(db, cid),
    queryReadings24hCount(db, cid),
    queryLastReadingInfo(db, cid),
    queryClientsWithAlertsCount(db, cid),
    queryDevicesUnmanagedCount(db, cid),
    queryAgentsReportingCount(db, cid, twentyFourHoursAgo),
    queryAgentVersionRows(db, cid),
    countOpenAlertsByClass(db, scope),
    queryDiscoveredTodayCount(db, cid, startOfToday),
    queryDiscoveredYesterdayCount(db, cid, startOfYesterday, startOfToday),
    queryPendingDevicesTotalCount(db, cid),
    getPublishedAgentVersion(redis),
    queryDevicesReportingCount(db, cid, twentyFourHoursAgo),
    queryMovementsCounts(db, cid, startOfYesterday),
  ]);

  const { total, deviceTrend } = computeDeviceTrend(devicesCount, newDevicesCount);
  const alertsByClass = mapAlertsByClass(alertsByClassRows);

  return {
    stats: {
      devices: total,
      // Campo aditivo — no se cambia la forma de `devices` para no
      // romper consumidores existentes de este endpoint.
      devicesUnmanaged: Number(devicesUnmanagedCount?.c || 0),
      devicesReporting: Number(devicesReportingCount?.c || 0),
      agents: {
        total: agentsStats?.total || 0,
        online: agentsStats?.online || 0,
        reporting: Number(agentsReportingCount?.c || 0),
      },
      clients: Number(clientsCount?.c || 0),
      volume: Number(monthlyVolume?.total || 0),
      deviceTrend,
    },
    topClients: (topClients as Array<{ name: string; id: string; device_count: string | number }>).map((c) => ({ ...c, device_count: Number(c.device_count) })),
    brands: (brandStats as Array<{ brand: string; count: string | number }>).map((b) => ({ ...b, count: Number(b.count) })),
    offlineAgents,
    agentVersions: (agentVersionRows as Array<{ version: string; count: string | number }>).map((v) => ({ version: v.version, count: Number(v.count) })),
    currentAgentVersion: publishedAgentVersion,
    alertsByClass,
    discovered: {
      today: Number(discoveredTodayCount?.c || 0),
      yesterday: Number(discoveredYesterdayCount?.c || 0),
      pendingTotal: Number(pendingDevicesTotalCount?.c || 0),
    },
    movements: {
      recent: Number(movementsCounts?.recent || 0),
      total: Number(movementsCounts?.total || 0),
    },
    systemHealth: {
      status: "healthy",
      uptime: process.uptime(),
      lastSync: lastReadingInfo?.time ?? null,
      lastClient: lastReadingInfo?.client_name ?? null,
      readingsCount24h: Number(readings24hCount?.c || 0),
      clientsWithAlertsCount: Number(clientsWithAlertsCount?.c || 0),
    },
  };
}

async function globalSearch(agentService: AgentService, request: FastifyRequest) {
  const { q } = request.query as { q?: string };
  if (!q || q.length < 2) return { clients: [], devices: [] };
  const scope = getScope(request);
  return await agentService.globalSearch(q, scope.kind === "client" ? scope.id : null);
}

export function createDashboardHandlers(db: Knex, agentService: AgentService, redis: Redis) {
  return {
    getDashboard: (request: FastifyRequest) => getDashboard(db, redis, request),
    globalSearch: (request: FastifyRequest) => globalSearch(agentService, request),
  };
}
