/**
 * Read models del dominio `clients`. Se mantienen en snake_case a propósito:
 * `clients.*` y `devices.*` son tablas ANCHAS que otros módulos extienden con
 * columnas propias (`notification_events`, `supply_requests_enabled`,
 * `supply_request_threshold_pct`, `custom_data`, ...) y el portal consume
 * las filas tal cual — enumerar columnas en camelCase acá haría que cada
 * columna nueva de otro módulo desapareciera del wire en silencio. Mismo
 * criterio que `PeriodUsageLine` en `modules/reports`.
 */

/** Fila de `clients` + contadores agregados (monitores, equipos). */
export interface ClientRecord {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country: string | null;
  notification_email: string | null;
  notification_webhook_url: string | null;
  device_approval_required: boolean;
  created_at: Date;
  monitor_count?: number;
  device_count?: number;
  decommissioned_device_count?: number;
  active_monitor_count?: number;
  [column: string]: unknown;
}

/** Fila de `agents` del cliente + `device_count` (sin `ip_ranges` para client_viewer). */
export interface ClientMonitorRow {
  id: string;
  name: string;
  status: string;
  last_seen: Date | null;
  hardware_id: string | null;
  host_name: string | null;
  scan_interval_minutes: number | null;
  ip_ranges?: unknown;
  device_count: number;
}

/** Fila de `devices` del cliente + estado derivado y datos del monitor. */
export interface ClientDeviceRow {
  id: string;
  status: "online" | "offline";
  monitor_name: string | null;
  monitor_last_seen: Date | null;
  [column: string]: unknown;
}

export interface ClientUsageMonth {
  month: string;
  month_date: Date;
  mono: number;
  color: number;
}

/** Campos editables del cliente — el whitelist de `createClient`/`updateClient`. */
export interface ClientContactFields {
  name?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  country?: string | null;
}

export interface ClientSettingsFields {
  notification_email?: string | null;
  notification_webhook_url?: string | null;
  notification_events?: string[];
  device_approval_required?: boolean;
}
