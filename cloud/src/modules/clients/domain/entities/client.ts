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

/** Estado operativo derivado en el SERVIDOR (handoff hifi "Clientes", 25/08/2026):
 * sin contacto asignado → `sin_contacto` (prioridad sobre lo demás); con contacto
 * pero sin reporte de ningún equipo en >24h → `sin_reporte`; resto → `activo`. */
export type ClientEstado = "activo" | "sin_contacto" | "sin_reporte";

/** Fila del listado paginado/filtrado/ordenado de la cartera ("Clientes"), con
 * las columnas nuevas que pide el handoff (alertas abiertas, último reporte) y
 * el estado ya resuelto — nada de esto se deriva en el frontend. */
export interface ClientDirectoryRow {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  country: string | null;
  monitor_count: number;
  device_count: number;
  alerts_count: number;
  last_report_at: Date | null;
  estado: ClientEstado;
}

/** Tira de métricas de cartera — endpoint aparte del listado paginado (mismo
 * criterio que `GET /alerts/summary` vs `GET /alerts`). */
export interface ClientPortfolioSummary {
  clients_total: number;
  devices_total: number;
  monitors_total: number;
  with_contact: number;
  without_contact: number;
  with_open_alerts: number;
  open_alerts_total: number;
  top5_device_count: number;
  top5_device_share_pct: number;
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
