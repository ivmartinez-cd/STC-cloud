import { ALERT_CLASS_LABELS, type AlertClass } from "../../../alerts";
import type { DashboardRepository } from "../../domain/repositories/dashboard-repository";
import { computeDeviceTrend } from "../../domain/services/dashboard-derived-stats";
import type { AlertsByClassReader } from "../ports/alerts-by-class-reader";
import type { AgentVersionReader } from "../ports/agent-version-reader";

/** Estructuralmente igual a `Scope` de `api/utils/scope.ts` — no se importa
 * ese tipo acá para no violar `arch-application` (application no puede
 * importar `src/api/**`); el chequeo de tipos de TS es estructural, así que
 * un valor real de `Scope` sigue siendo asignable acá sin el import. */
export type DashboardScope = { kind: "all" } | { kind: "client"; id: string };

function mapAlertsByClass(rows: Array<{ alertClass: AlertClass | null; count: number }>) {
  return rows
    .filter((r): r is { alertClass: AlertClass; count: number } => r.alertClass !== null)
    .map((r) => ({ alert_class: r.alertClass, label: ALERT_CLASS_LABELS[r.alertClass] ?? r.alertClass, count: r.count }))
    .sort((a, b) => b.count - a.count);
}

export class GetDashboardStatsUseCase {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly alertsReader: AlertsByClassReader,
    private readonly agentVersionReader: AgentVersionReader
  ) {}

  async execute(scope: DashboardScope) {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const cid = scope.kind === "client" ? scope.id : null;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

    const [
      devicesCount, agentsStats, clientsCount, monthlyVolume, topClients, brandStats, offlineAgents,
      newDevicesCount, readings24hCount, lastReadingInfo, clientsWithAlertsCount, devicesUnmanagedCount,
      agentsReportingCount, agentVersionRows, alertsByClassRows, discoveredTodayCount, discoveredYesterdayCount,
      pendingDevicesTotalCount, publishedAgentVersion, publishedAgentVersions, devicesReportingCount, movementsCounts,
      incidentsOpenCount, supplyRequestsPendingCount,
    ] = await Promise.all([
      this.repo.devicesCount(cid),
      this.repo.agentsStats(cid, fiveMinsAgo),
      this.repo.clientsCount(cid),
      this.repo.monthlyVolume(cid),
      this.repo.topClients(cid),
      this.repo.brandStats(cid),
      this.repo.offlineAgents(cid, fiveMinsAgo),
      this.repo.newDevicesCount(cid),
      this.repo.readings24hCount(cid),
      this.repo.lastReadingInfo(cid),
      this.repo.clientsWithAlertsCount(cid),
      this.repo.devicesUnmanagedCount(cid),
      this.repo.agentsReportingCount(cid, twentyFourHoursAgo),
      this.repo.agentVersionRows(cid),
      this.alertsReader.countOpenAlertsByClass(scope),
      this.repo.discoveredTodayCount(cid, startOfToday),
      this.repo.discoveredYesterdayCount(cid, startOfYesterday, startOfToday),
      this.repo.pendingDevicesTotalCount(cid),
      this.agentVersionReader.getPublishedAgentVersion(),
      this.agentVersionReader.getPublishedVersionsByChannel(),
      this.repo.devicesReportingCount(cid, twentyFourHoursAgo),
      this.repo.movementsCounts(cid, startOfYesterday),
      this.repo.incidentsOpenCount(cid),
      this.repo.supplyRequestsPendingCount(cid),
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
      topClients: topClients.map((c) => ({ ...c, device_count: Number(c.device_count) })),
      brands: brandStats.map((b) => ({ ...b, count: Number(b.count) })),
      offlineAgents,
      agentVersions: agentVersionRows.map((v) => ({ version: v.version, channel: v.channel, count: Number(v.count) })),
      currentAgentVersion: publishedAgentVersion,
      publishedAgentVersions,
      alertsByClass,
      alertsOpenTotal: alertsByClass.reduce((sum, a) => sum + a.count, 0),
      discovered: {
        today: Number(discoveredTodayCount?.c || 0),
        yesterday: Number(discoveredYesterdayCount?.c || 0),
        pendingTotal: Number(pendingDevicesTotalCount?.c || 0),
      },
      movements: {
        recent: Number(movementsCounts?.recent || 0),
        total: Number(movementsCounts?.total || 0),
      },
      incidents: {
        openTotal: Number(incidentsOpenCount?.c || 0),
      },
      supplyRequests: {
        pending: Number(supplyRequestsPendingCount?.c || 0),
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
}
