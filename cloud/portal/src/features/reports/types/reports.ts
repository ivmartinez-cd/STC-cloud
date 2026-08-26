/**
 * Formas devueltas por `GET /clients/:id/reports*` (`reportController.ts`).
 */

export interface PreviewLine {
  device_id: string;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  agent_id: string | null;
  agent_name: string | null;
  source: string | null;
  first_reading_at: string | null;
  first_total: number | null;
  first_mono: number | null;
  first_color: number | null;
  last_reading_at: string | null;
  last_total: number | null;
  last_mono: number | null;
  last_color: number | null;
  delta_total: number;
  delta_mono: number;
  delta_color: number;
  delta_other: number;
  delta_estimated: number | null;
  had_counter_reset: boolean;
}

export interface PreviewResponse {
  period: string;
  lines: PreviewLine[];
}

export type ClosureStatus = 'closed' | 'reopened';

export interface Closure {
  id: string;
  client_id: string;
  period: string;
  status: ClosureStatus;
  closed_at: string;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  superseded_by: string | null;
  total_pages: number;
  total_mono: number;
  total_color: number;
  total_other: number;
  device_count: number;
  anomalies_count: number;
}

/** Línea persistida de un cierre — misma forma que `PreviewLine` pero con nombres de columna congelados. */
export interface ClosureLine {
  id: string;
  closure_id: string;
  device_id: string | null;
  device_serial: string | null;
  device_model: string | null;
  device_brand: string | null;
  agent_id: string | null;
  agent_name: string | null;
  first_reading_at: string | null;
  first_total_pages: number | null;
  first_mono_pages: number | null;
  first_color_pages: number | null;
  last_reading_at: string | null;
  last_total_pages: number | null;
  last_mono_pages: number | null;
  last_color_pages: number | null;
  delta_total: number;
  delta_mono: number;
  delta_color: number;
  delta_other: number;
  delta_estimated: number | null;
  source: string | null;
  had_counter_reset: boolean;
}

export interface ClosureDetail extends Closure {
  lines: ClosureLine[];
}
