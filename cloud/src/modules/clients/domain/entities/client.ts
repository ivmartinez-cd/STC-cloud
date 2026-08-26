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

/** Métricas de "requiere atención" del handoff hifi "Cliente — detalle" (25/08/2026)
 * para la tira de 6 métricas — endpoint aparte (`GET /clients/:id/stats`), igual
 * criterio que `getPortfolioSummary`: no ensucia `findWithCounts`/`listWithCounts`
 * (que siguen alimentando `GET /clients/:id` y el viejo `GET /clients` sin cambios). */
export interface ClientDetailStats {
  /** `device_count` con `monitor_state = 'full'` (activamente monitoreado) — el resto
   * del `device_count` de `ClientRecord` son equipos en `supplies_only`/`reports_only`. */
  managed_device_count: number;
  alerts_open_count: number;
  /** Subconjunto de `alerts_open_count` con `alert_class = 'availability'` (Disponibilidad). */
  alerts_availability_count: number;
}

/** Estado operativo de UN dispositivo (no confundir con `ClientEstado`, que es del
 * CLIENTE) — derivado de `last_seen` con el umbral unificado
 * (`system_settings.device_offline_threshold_minutes`, 26/08/2026, mismo que
 * `heartbeatMonitor.ts`), no de `devices.active` (columna histórica que
 * ningún código escribe nunca a `false`, ver knex-client-repository.ts). */
export type ClientDeviceEstado = "en_linea" | "sin_conexion" | "sin_reporte";
export type ClientDeviceSegment = "sin_conexion" | "con_alertas" | "consumible_bajo";
export type ClientDeviceSortField = "alerts_count" | "consumible_pct" | "last_seen";

export interface ClientDeviceDirectoryQuery {
  clientId: string;
  /** Busca en serie, modelo y ubicación (README: "Buscar por serie, modelo o ubicación…"). */
  q?: string;
  segment?: ClientDeviceSegment;
  sortField?: ClientDeviceSortField;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Fila de la tabla "Infraestructura de monitoreo" del detalle de cliente — paginada/
 * filtrada/ordenada server-side (mismo patrón que `ClientDirectoryRow`). */
export interface ClientDeviceDirectoryRow {
  id: string;
  brand: string | null;
  model: string | null;
  name: string | null;
  serial_number: string | null;
  location: string | null;
  last_seen: Date | null;
  /** Tóners individuales — un equipo color pinta una mini-barra por color (K/C/M/Y). */
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  estado: ClientDeviceEstado;
  /** Mínimo entre los 4 tóners no nulos (LEAST ignora NULL en Postgres) — el
   * consumible más urgente del equipo. `null` si no reporta niveles de tóner
   * (tambores/mantenimiento viven sólo en `supplies_details` JSON, fuera de
   * alcance de esta barra única — ver `suppliesService` para el detalle completo). */
  consumible_pct: number | null;
  alerts_count: number;
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
