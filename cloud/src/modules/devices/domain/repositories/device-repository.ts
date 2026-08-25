import type { AgentRow, DeviceRow, DeviceScope, StaleDeviceRow } from "../entities/device";

export interface ReadingsQuery {
  from?: string;
  to?: string;
  limit?: string;
}

export interface ListDevicesQuery {
  scope: DeviceScope;
  includeDecommissioned: boolean;
  /** Busca por IP, serial, marca, modelo, nombre, cliente o monitor — mismo criterio que `PendingQuery.q` en `device-registration-repository.ts`. */
  q?: string;
  limit?: number;
  offset?: number;
}

export interface UsageHistoryQuery {
  granularity?: string;
  limit?: string;
}

export interface DecommissionFields {
  by: string | null;
  reason: string;
}

/**
 * Lecturas + CRUD + ciclo de vida single/bulk de `devices`. Las operaciones
 * "de fila" son deliberadamente chicas: la orquestación (qué se hace en qué
 * orden y dentro de qué transacción) es de los casos de uso.
 */
export interface DeviceRepository {
  /** `devices.*` + estado derivado + nombre de monitor/cliente, paginado (R9 gap analysis: "sin paginación ninguna tabla del portal"). */
  list(query: ListDevicesQuery): Promise<{ items: DeviceRow[]; total: number }>;
  /** Ficha completa (join a modelos, uso 30d, lápida). Acepta uuid, prefijo de uuid, serial o IP. SIN filtro de ciclo de vida a propósito. */
  getDetail(identifier: string, scope: DeviceScope): Promise<DeviceRow | null>;
  /** Resuelve uuid/prefijo/serial/IP a un id dentro del scope (sin filtro de ciclo de vida). `allowIp=false` para usage-history (histórico). */
  resolveId(identifier: string, scope: DeviceScope, allowIp: boolean): Promise<string | null>;
  readings(deviceId: string, query: ReadingsQuery): Promise<unknown[]>;
  usageHistory(deviceId: string, query: UsageHistoryQuery): Promise<unknown[]>;
  duplicates(clientId: string, agentId?: string): Promise<unknown[]>;

  findOwned(id: string, scope: DeviceScope, forUpdate?: boolean): Promise<DeviceRow | null>;
  /** Filas que matchean `ids` Y el scope — un id ajeno simplemente no vuelve. */
  findManyOwned(ids: string[], scope: DeviceScope, forUpdate?: boolean): Promise<Map<string, DeviceRow>>;
  countOwned(ids: string[], clientId: string): Promise<number>;
  findAgent(agentId: string): Promise<AgentRow | null>;
  update(id: string, updates: Record<string, unknown>): Promise<DeviceRow>;

  hasClosureLines(id: string): Promise<boolean>;
  isMergeTarget(id: string): Promise<boolean>;
  /** Borra lecturas + alertas + fila; devuelve filas de `devices` borradas. */
  hardDelete(id: string): Promise<number>;

  setDecommissioned(ids: string[], fields: DecommissionFields): Promise<void>;
  clearDecommissioned(ids: string[]): Promise<void>;
  reassign(ids: string[], agentId: string, clientId: string): Promise<void>;
  resolveOpenAlerts(deviceIds: string[]): Promise<number>;
  findStale(agentId: string, cutoff: Date): Promise<StaleDeviceRow[]>;
  findSerialCollision(clientId: string, serial: string, excludeId: string): Promise<{ id: string } | null>;
  /** serial (upper) → id ajeno que ya lo tiene en el cliente destino. */
  findSerialCollisions(clientId: string, serialsUpper: string[], excludeIds: string[]): Promise<Map<string, string>>;

  setMonitorState(id: string, state: string, by: string | null, reason: string | null): Promise<DeviceRow>;
}
