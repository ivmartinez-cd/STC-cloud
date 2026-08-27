import type { UsageRate } from "../entities/supply-row";

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
}
