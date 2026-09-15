import type { SupplyRow } from './supplies';

/** Espejo de `cloud/src/modules/supplies/domain/entities/supply-history.ts`. */

export interface SupplyLevelPoint {
  day: string;
  level: number | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
}

export interface SupplyReplacement {
  at: string;
  from_pct: number;
  to_pct: number;
}

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

export interface SupplyRequestHistoryRow {
  id: string;
  opened_at: string;
  external_ref: string | null;
  description: string | null;
  supply_serial: string | null;
  sku: string | null;
  reason: 'low_level' | 'runtime' | 'manual' | null;
  level_pct: number | null;
  remaining_days: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  total_pages: number | null;
  status: string;
  origin: string;
  replaced_at: string | null;
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
  engine_cycles: number | null;
}

export interface SupplyHistory {
  device: SupplyHistoryDevice;
  supply: SupplyRow;
  points: SupplyLevelPoint[];
  replacements: SupplyReplacement[];
  cycle: SupplyCycle;
  requests: SupplyRequestHistoryRow[];
}

/** Ventanas del selector del modal — el recorte es en el navegador, no vuelve a pegarle a la API. */
export const RANGES = ['12m', '24m', 'all'] as const;
export type SupplyHistoryRange = (typeof RANGES)[number];

export const RANGE_LABELS: Record<SupplyHistoryRange, string> = {
  '12m': '12 M', '24m': '24 M', all: 'TODO',
};

export const REASON_LABELS: Record<string, string> = {
  low_level: 'Nivel bajo',
  runtime: 'Tiempo de ejecución',
  manual: 'Manual',
};
