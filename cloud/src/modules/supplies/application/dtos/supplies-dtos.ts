import type { FleetSupplyRow, SupplyKind, SupplyUrgency } from "../../domain/entities/supply-row";

export interface FleetSuppliesParams {
  clientId?: string | null;
  agentId?: string | null;
  kind?: SupplyKind | null;
  maxPercentage?: number | null;
  maxDays?: number | null;
  /** Buscador (handoff hifi #3, fase 3, 26/08/2026) — SKU, serie, modelo o cliente. */
  query?: string | null;
  urgency?: SupplyUrgency | null;
  limit?: number;
  offset?: number;
}

export interface SuppliesSummary {
  total: number;
  criticalCount: number;
  lowCount: number;
  noReadingCount: number;
  openOrders: number;
  top: FleetSupplyRow[];
}
