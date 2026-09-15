import type { UsageRate } from "../entities/supply-row";
import type { SupplyHistoryDevice, SupplyLevelPoint, SupplyRequestHistoryRow } from "../entities/supply-history";

export interface SuppliesDeviceRow extends Record<string, unknown> {
  id: string;
  supplies_details: unknown;
}

export interface FleetDeviceRow extends SuppliesDeviceRow {
  client_id_join?: string | null;
  client_name?: string | null;
  agent_name?: string | null;
  serial_number?: string | null;
  model?: string | null;
  brand?: string | null;
  last_seen?: string | null;
}

export interface FleetDeviceParams {
  clientId?: string | null;
  agentId?: string | null;
}

/** Puerto del módulo — implementado sobre Knex en `infrastructure/database`. */
export interface SuppliesRepository {
  findDeviceById(deviceId: string): Promise<SuppliesDeviceRow | null>;
  fleetDevices(params: FleetDeviceParams): Promise<FleetDeviceRow[]>;
  usageRatesFor(deviceIds: string[]): Promise<Map<string, UsageRate>>;
  countOpenSupplyRequests(params: FleetDeviceParams): Promise<number>;
  /** Cabecera del modal de detalle: equipo + cliente + ciclos de trabajo del motor. */
  historyDevice(deviceId: string): Promise<SupplyHistoryDevice | null>;
  /**
   * Serie diaria del nivel de UN consumible + contadores del equipo, desde
   * `readings_daily_agg` (sobrevive a la retención de 24 meses de `readings`).
   * Sólo los 4 tóners tienen columna de nivel: para tambores/mantenimiento
   * `level` viene `null` y quedan los contadores.
   */
  levelSeries(deviceId: string, supplyKey: string): Promise<SupplyLevelPoint[]>;
  /** Solicitudes del consumible, ASCENDENTE por `opened_at` y sin deltas (los calcula el dominio). */
  requestHistory(deviceId: string, supplyKey: string): Promise<SupplyRequestHistoryRow[]>;
}
