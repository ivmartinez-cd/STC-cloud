import type { Device } from '../../../shared/types/monitor';
import type { ReadingPoint } from '../../../shared/lib/supplies';
import type { AlertClass } from '../../../shared/types/alerts';

export interface Reading extends ReadingPoint {
  id: string;
  toner_black?:   number | null;
  toner_cyan?:    number | null;
  toner_magenta?: number | null;
  toner_yellow?:  number | null;
}

/** Respuesta de GET /devices/:id (devices.* + joins de agente/cliente). */
export interface DeviceDetailData extends Device {
  monitor_name?:    string;
  client_name?:     string;
  client_id?:       string;
  agent_status?:    string;
  agent_last_seen?: string | null;
  status?:          string;
  name_reported?:      string | null;
  location_reported?:  string | null;
  merged_into_serial?: string | null;
}

export type DeviceDetailTab = 'general' | 'counters' | 'supplies' | 'media' | 'alerts' | 'incidents' | 'history' | 'costs' | 'ews';

/** Alerta activa deduplicada: del servidor + las que reporta el propio equipo.
 * `alertClass` sólo viene poblado en las de origen servidor (las que reporta
 * el equipo vía `supplies_details.alerts` no traen clasificación) — se usa
 * para el título de "Alertas actuales" y para no clasificar `undefined` como si fuera una clase real. */
export interface ActiveAlertItem {
  key: string;
  severity: string;
  message: string;
  code?: string;
  time?: string;
  alertClass?: AlertClass | null;
}

// Detalle de DISPOSITIVO hifi (handoff "Dispositivo — detalle", 25/08/2026) —
// tipos del wire de `GET /devices/:id/stats` y `/print-trend`. Todo lo
// derivado (porcentajes, promedio, pico, proyección) se calcula en el
// SERVIDOR, nunca acá — mismo criterio que `AgentStats`/`ClientDetailStats`.

export interface DeviceLowestSupply {
  pct: number;
  label: string;
  remaining_pages: number | null;
}

export interface DeviceJamSummary {
  count_30d: number;
  last_at: string | null;
  tray_label: string | null;
}

/** Tira de 6 métricas del header de identidad del equipo. */
export interface DeviceStats {
  total_counter: number;
  volume_month: number;
  volume_month_site_pct: number | null;
  mono_pages: number;
  mono_pct: number | null;
  color_pages: number;
  color_pct: number | null;
  lowest_supply: DeviceLowestSupply | null;
  jams: DeviceJamSummary;
}

export interface PrintTrendMonth {
  month: string;
  month_date: string;
  mono: number;
  color: number;
  total: number;
}

/** "Tendencia de impresión · 12 meses" — `months` siempre trae 12 filas. */
export interface PrintTrend {
  months: PrintTrendMonth[];
  monthly_avg: number;
  peak: { month: string; total: number } | null;
  projection_next_month: number | null;
}
