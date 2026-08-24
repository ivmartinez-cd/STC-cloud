import type { Knex } from "knex";
import { deviceSupplies, fleetSupplies } from "../../../../services/suppliesService";
import type {
  EnabledClient,
  EnabledClientsSource,
  SupplyLevelRow,
  SupplySnapshot,
} from "../../application/ports/supply-snapshot";

/**
 * Adaptador sobre `suppliesService` (Fase 8 de la Fase 3): la misma fuente
 * que alimenta la vista de consumibles del portal alimenta la detección de
 * pedidos — un solo cálculo de niveles/días restantes en todo el sistema.
 * `fleetSupplies` tope 200 filas por cliente por tick: suficiente (son solo
 * los que están BAJO el umbral; si un cliente tiene >200 consumibles
 * críticos a la vez, los restantes entran en el tick siguiente al cerrarse
 * los primeros).
 */
export class KnexSupplySnapshot implements SupplySnapshot {
  constructor(private readonly db: Knex) {}

  async belowThreshold(clientId: string, thresholdPct: number): Promise<SupplyLevelRow[]> {
    const { items } = await fleetSupplies(this.db, {
      clientId, maxPercentage: thresholdPct, limit: 200, offset: 0,
    });
    return items
      .filter((r) => r.percentage != null)
      .map((r) => ({
        deviceId: r.device_id,
        deviceSerial: r.device_serial,
        deviceLabel: r.device_model,
        supplyKey: r.key,
        supplyKind: r.kind,
        supplyColor: r.color,
        description: r.description,
        sku: r.code,
        percentage: r.percentage,
        remainingDays: r.remainingDays,
      }));
  }

  async currentLevel(deviceId: string, supplyKey: string): Promise<number | null> {
    const result = await deviceSupplies(this.db, deviceId);
    if (!result) return null;
    const row = result.rows.find((r) => r.key === supplyKey);
    return row?.percentage ?? null;
  }
}

export class KnexEnabledClients implements EnabledClientsSource {
  constructor(private readonly db: Knex) {}

  async listEnabled(): Promise<EnabledClient[]> {
    const rows = await this.db("clients")
      .where("supply_requests_enabled", true)
      .select("id", "supply_request_threshold_pct");
    return rows.map((r) => ({ id: r.id, thresholdPct: r.supply_request_threshold_pct }));
  }
}
