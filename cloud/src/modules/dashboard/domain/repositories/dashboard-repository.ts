export interface CountRow { c?: string | number }

/** Puerto de lectura del dashboard — implementado sobre Knex en `infrastructure/database`.
 * Son queries de agregación de sólo lectura cruzando varios módulos (devices, agents,
 * clients, readings, alerts, incidents, supply_requests, audit_logs); vive acá (no en cada
 * módulo dueño) porque el dashboard es un read-model propio, no un caso de uso de escritura
 * de ningún otro módulo — mismo criterio que un contexto de reporting en CQRS. */
export interface DashboardRepository {
  devicesCount(cid: string | null): Promise<CountRow | undefined>;
  agentsStats(cid: string | null, fiveMinsAgo: Date): Promise<{ total?: number; online?: number } | undefined>;
  clientsCount(cid: string | null): Promise<CountRow | undefined>;
  monthlyVolume(cid: string | null): Promise<{ total: string | null } | undefined>;
  topClients(cid: string | null): Promise<Array<{ name: string; id: string; device_count: string | number }>>;
  brandStats(cid: string | null): Promise<Array<{ brand: string; count: string | number }>>;
  offlineAgents(cid: string | null, fiveMinsAgo: Date): Promise<Array<{ id: string; name: string; client_name: string; last_seen: string | null }>>;
  newDevicesCount(cid: string | null): Promise<CountRow | undefined>;
  readings24hCount(cid: string | null): Promise<CountRow | undefined>;
  lastReadingInfo(cid: string | null): Promise<{ time: string; client_name: string } | undefined>;
  clientsWithAlertsCount(cid: string | null): Promise<CountRow | undefined>;
  devicesUnmanagedCount(cid: string | null): Promise<CountRow | undefined>;
  agentsReportingCount(cid: string | null, twentyFourHoursAgo: Date): Promise<CountRow | undefined>;
  agentVersionRows(cid: string | null): Promise<Array<{ version: string; count: string | number }>>;
  discoveredTodayCount(cid: string | null, startOfToday: Date): Promise<CountRow | undefined>;
  discoveredYesterdayCount(cid: string | null, startOfYesterday: Date, startOfToday: Date): Promise<CountRow | undefined>;
  pendingDevicesTotalCount(cid: string | null): Promise<CountRow | undefined>;
  devicesReportingCount(cid: string | null, twentyFourHoursAgo: Date): Promise<CountRow | undefined>;
  incidentsOpenCount(cid: string | null): Promise<CountRow | undefined>;
  supplyRequestsPendingCount(cid: string | null): Promise<CountRow | undefined>;
  movementsCounts(cid: string | null, startOfYesterday: Date): Promise<{ total?: number; recent?: number } | undefined>;
}
