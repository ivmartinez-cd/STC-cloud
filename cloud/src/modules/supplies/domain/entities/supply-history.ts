import type { SupplyRow } from "./supply-row";

/** Un bucket diario de `readings_daily_agg` proyectado sobre UN consumible. */
export interface SupplyLevelPoint {
  day: string;
  level: number | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
}

/** Salto de nivel hacia arriba = cartucho cambiado (mismo criterio que el auto-cierre de pedidos). */
export interface SupplyReplacement {
  at: string;
  from_pct: number;
  to_pct: number;
}

/**
 * "Detalles de rendimiento" del SDS: todo medido DESDE el último reemplazo
 * detectado, nunca desde el principio de la serie. Las dos estimaciones son
 * páginas-por-punto-de-nivel observadas en este ciclo × nivel actual — NO el
 * `remainingPages` que informa el equipo (ese va en la ficha de identificación,
 * y es normal que difieran).
 */
export interface SupplyCycle {
  started_at: string | null;
  initial_level: number | null;
  current_level: number | null;
  used_pct: number | null;
  days_in_use: number | null;
  cycles_at_start: number | null;
  cycles_in: number | null;
  mono_printed: number | null;
  color_printed: number | null;
  total_printed: number | null;
  est_total_remaining: number | null;
  est_color_remaining: number | null;
}

/** Fila del "Historial de solicitudes de consumibles" — snapshot persistido + deltas derivados. */
export interface SupplyRequestHistoryRow {
  id: string;
  opened_at: string;
  external_ref: string | null;
  description: string | null;
  supply_serial: string | null;
  sku: string | null;
  reason: string | null;
  level_pct: number | null;
  remaining_days: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  total_pages: number | null;
  status: string;
  origin: string;
  replaced_at: string | null;
  /** Derivados contra la solicitud anterior del mismo consumible — no persisten. */
  delta_total: number | null;
  delta_color: number | null;
}

export interface SupplyHistoryDevice {
  id: string;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  client_id: string | null;
  client_name: string | null;
  last_seen: string | null;
  /** `supplies_details.counters.engineCycles` — "Ciclos de trabajo" del SDS. Cae a `total_pages`. */
  engine_cycles: number | null;
}

export interface SupplyHistory {
  device: SupplyHistoryDevice;
  supply: SupplyRow;
  /** Serie diaria completa disponible (tope en el repo). El recorte 12M/24M lo hace el portal. */
  points: SupplyLevelPoint[];
  replacements: SupplyReplacement[];
  cycle: SupplyCycle;
  requests: SupplyRequestHistoryRow[];
}
