import type { Knex } from "knex";
import type { DeviceCosts, DeviceCostsWrite } from "../../domain/entities/device-costs";

const TABLE = "device_costs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number | null => (v == null ? null : Number(v));

function toEntity(row: any): DeviceCosts {
  return {
    deviceId: row.device_id,
    capitalCost: num(row.capital_cost),
    quarterlyRental: num(row.quarterly_rental),
    monoPageCost: num(row.mono_page_cost),
    colorPageCost: num(row.color_page_cost),
    serviceContractCost: num(row.service_contract_cost),
    serviceContractYears: row.service_contract_years,
    currency: row.currency,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export class KnexDeviceCostsRepository {
  constructor(private readonly db: Knex) {}

  async findByDevice(deviceId: string): Promise<DeviceCosts | null> {
    const row = await this.db(TABLE).where({ device_id: deviceId }).first();
    return row ? toEntity(row) : null;
  }

  /** Costes de todos los equipos de un cliente, para los billing figures. */
  async mapByClient(clientId: string): Promise<Map<string, DeviceCosts>> {
    const rows = await this.db(TABLE)
      .join("devices", "devices.id", `${TABLE}.device_id`)
      .where("devices.client_id", clientId)
      .select(`${TABLE}.*`);
    return new Map(rows.map((r: any) => [r.device_id, toEntity(r)]));
  }

  async upsert(deviceId: string, data: DeviceCostsWrite, updatedBy: string | null): Promise<DeviceCosts> {
    const row = {
      device_id: deviceId,
      capital_cost: data.capitalCost,
      quarterly_rental: data.quarterlyRental,
      mono_page_cost: data.monoPageCost,
      color_page_cost: data.colorPageCost,
      service_contract_cost: data.serviceContractCost,
      service_contract_years: data.serviceContractYears,
      currency: data.currency,
      updated_by: updatedBy,
      updated_at: new Date(),
    };
    const [saved] = await this.db(TABLE).insert(row).onConflict("device_id").merge().returning("*");
    return toEntity(saved);
  }
}
