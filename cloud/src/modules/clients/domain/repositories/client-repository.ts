import type { ClientDeviceRow, ClientMonitorRow, ClientRecord, ClientUsageMonth } from "../entities/client";

/** Estructuralmente idéntico a `api/utils/scope.ts::Scope` — duplicado para que el dominio no importe de HTTP. */
export type ClientScope = { kind: "all" } | { kind: "client"; id: string };

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
}
