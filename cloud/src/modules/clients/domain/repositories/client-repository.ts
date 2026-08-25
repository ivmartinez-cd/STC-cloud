import type {
  ClientDetailStats, ClientDeviceDirectoryQuery, ClientDeviceDirectoryRow, ClientDeviceRow, ClientDirectoryRow,
  ClientMonitorRow, ClientPortfolioSummary, ClientRecord, ClientUsageMonth,
} from "../entities/client";

/** Estructuralmente idéntico a `api/utils/scope.ts::Scope` — duplicado para que el dominio no importe de HTTP. */
export type ClientScope = { kind: "all" } | { kind: "client"; id: string };

export type ClientDirectorySortField = "monitor_count" | "device_count" | "alerts_count" | "last_report_at";
export type ClientDirectorySegment = "sin_contacto" | "con_alertas" | "sin_reporte_24h";

export interface ClientDirectoryQuery {
  scope: ClientScope;
  /** Busca en nombre, contacto (nombre/email) y país — mismo criterio ILIKE OR'd que `applyDeviceSearch` en `devices`. */
  q?: string;
  segment?: ClientDirectorySegment;
  sortField?: ClientDirectorySortField;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ClientRepository {
  exists(id: string): Promise<boolean>;
  insert(data: Record<string, unknown>): Promise<ClientRecord>;
  /** `returning('*')` — la fila completa después del update. */
  update(id: string, updates: Record<string, unknown>): Promise<ClientRecord>;
  /** Con contadores; scope "client" restringe a ese único cliente. Techo de 2000 (auditoría de capacidad). */
  listWithCounts(scope: ClientScope): Promise<ClientRecord[]>;
  findWithCounts(id: string): Promise<ClientRecord | null>;
  /** `ip_ranges` es topología interna de la LAN del cliente — sólo con `includeIpRanges`. */
  listMonitors(clientId: string, includeIpRanges: boolean): Promise<ClientMonitorRow[]>;
  /** Volumen mensual (últimos 4 meses) por suma de deltas positivos, no MAX-MIN. */
  usageByMonth(clientId: string): Promise<ClientUsageMonth[]>;
  listDevices(clientId: string, includeDecommissioned: boolean): Promise<ClientDeviceRow[]>;
  /**
   * Listado paginado/filtrado/ordenado de la tabla hifi de "Clientes" (handoff
   * 25/08/2026) — alertas abiertas y último reporte por cliente + `estado`
   * derivado en el servidor. Techo 200 (mismo criterio que `DeviceRepository.list()`).
   */
  listDirectory(query: ClientDirectoryQuery): Promise<{ items: ClientDirectoryRow[]; total: number }>;
  /** Tira de métricas de cartera — endpoint aparte del listado paginado. */
  getPortfolioSummary(scope: ClientScope): Promise<ClientPortfolioSummary>;
  /** Métricas de "requiere atención" del detalle de cliente (handoff hifi
   * "Cliente — detalle", 25/08/2026) — endpoint aparte, no ensucia `findWithCounts`. */
  getClientStats(clientId: string): Promise<ClientDetailStats>;
  /**
   * Tabla "Infraestructura de monitoreo" del detalle de cliente — paginado/filtrado/
   * ordenado real (handoff hifi "Cliente — detalle", 25/08/2026), a diferencia de
   * `listDevices()` de arriba (sin paginar, techo 500, para selects chicos). Techo
   * 200, mismo criterio que `listDirectory()`.
   */
  listDevicesDirectory(query: ClientDeviceDirectoryQuery): Promise<{ items: ClientDeviceDirectoryRow[]; total: number }>;
}
