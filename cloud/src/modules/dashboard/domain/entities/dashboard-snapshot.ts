/**
 * Tendencia del panel de control (handoff "Panel de control", 16/09/2026).
 * La fuente es `dashboard_snapshots` — ver el docblock de la migración
 * `20260916190000` para el porqué de la tabla.
 */

export const TREND_RANGES = ["24h", "7d", "30d"] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

/** Contadores medidos en una toma. `null` = esa toma no midió esa métrica. */
export interface SnapshotCounters {
  devicesTotal: number | null;
  devicesManaged: number | null;
  agentsTotal: number | null;
  agentsOnline: number | null;
  suppliesCritical: number | null;
  suppliesLow: number | null;
}

/** Una toma, ya resuelta a nivel cliente, tal como sale de la base. */
export interface SnapshotRow extends SnapshotCounters {
  at: Date;
  clientId: string;
  alertsByClass: Record<string, number>;
}

/** Un punto de la serie: la suma de los clientes del scope en ese bucket. */
export interface TrendPoint extends SnapshotCounters {
  at: string;
  alertsByClass: Record<string, number>;
  alerts: number;
}

export interface DashboardTrend {
  range: TrendRange;
  bucket: "hour" | "day";
  points: TrendPoint[];
}
