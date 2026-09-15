import type { Knex } from "knex";
import { deviceSupplies, fleetSupplies, type FleetSupplyRow } from "../../../supplies";
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
interface Counters { monoPages: number | null; colorPages: number | null; totalPages: number | null }
const EMPTY_COUNTERS: Counters = { monoPages: null, colorPages: null, totalPages: null };

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toLevelRow(r: FleetSupplyRow, counters: Counters): SupplyLevelRow {
  return {
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
    supplySerial: r.serial,
    ...counters,
  };
}

export class KnexSupplySnapshot implements SupplySnapshot {
  constructor(private readonly db: Knex) {}

  /** Contadores del equipo al momento del pedido — una sola query para los N equipos, nunca N+1. */
  private async countersFor(deviceIds: string[]): Promise<Map<string, Counters>> {
    if (!deviceIds.length) return new Map();
    const rows = await this.db("devices")
      .whereIn("id", deviceIds)
      .select("id", "mono_pages", "color_pages", "total_pages");
    return new Map(rows.map((r) => [r.id, {
      monoPages: num(r.mono_pages), colorPages: num(r.color_pages), totalPages: num(r.total_pages),
    }]));
  }

  async belowThreshold(clientId: string, thresholdPct: number): Promise<SupplyLevelRow[]> {
    const { items } = await fleetSupplies(this.db, {
      clientId, maxPercentage: thresholdPct, limit: 200, offset: 0,
    });
    const low = items.filter((r) => r.percentage != null);
    const counters = await this.countersFor([...new Set(low.map((r) => r.device_id))]);
    return low.map((r) => toLevelRow(r, counters.get(r.device_id) ?? EMPTY_COUNTERS));
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
