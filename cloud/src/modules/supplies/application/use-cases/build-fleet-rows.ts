import type { FleetDeviceParams, FleetDeviceRow, SuppliesRepository } from "../../domain/repositories/supplies-repository";
import type { FleetSupplyRow, SupplyRow, UsageRate } from "../../domain/entities/supply-row";
import { EMPTY_RATE } from "../../domain/entities/supply-row";
import { buildSupplyRows, parseSuppliesDetails } from "../../domain/services/supply-row-builder";
import { urgencyOf } from "../../domain/services/supply-urgency";

function toFleetRow(row: SupplyRow, d: FleetDeviceRow): FleetSupplyRow {
  return {
    ...row,
    device_id: d.id,
    device_serial: (d.serial_number as string | null | undefined) ?? null,
    device_model: (d.model as string | null | undefined) ?? null,
    device_brand: (d.brand as string | null | undefined) ?? null,
    client_id: (d.client_id_join as string | null | undefined) ?? null,
    client_name: (d.client_name as string | null | undefined) ?? null,
    agent_name: (d.agent_name as string | null | undefined) ?? null,
    last_seen: (d.last_seen as string | null | undefined) ?? null,
    urgency: urgencyOf(row.percentage),
  };
}

/** Compartido por `ListFleetSuppliesUseCase`, `GetSuppliesSummaryUseCase` y
 * `CountSuppliesBelowThresholdUseCase` — misma pasada de filas, nunca recalculada distinto. */
export async function buildFleetRows(repo: SuppliesRepository, params: FleetDeviceParams): Promise<FleetSupplyRow[]> {
  const devices = await repo.fleetDevices(params);
  const ids = devices.map((d) => d.id);
  const rateMap = await repo.usageRatesFor(ids);

  const rows: FleetSupplyRow[] = [];
  for (const d of devices) {
    const rate: UsageRate = rateMap.get(d.id) ?? EMPTY_RATE;
    const details = parseSuppliesDetails(d.supplies_details);
    for (const row of buildSupplyRows(d, details, rate)) {
      rows.push(toFleetRow(row, d));
    }
  }
  return rows;
}
