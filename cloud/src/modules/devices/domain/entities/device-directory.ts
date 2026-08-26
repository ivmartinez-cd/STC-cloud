/**
 * Read models del inventario global de dispositivos agrupado por cliente
 * (handoff hifi "Inventario de dispositivos", 25/08/2026). `estado`/
 * `consumible_pct`/`alerts_count` se calculan en el SERVIDOR — mismo criterio
 * que `ClientDeviceDirectoryRow` (módulo `clients`), nunca en el front.
 */

/** Sólo 2 estados "en vivo" (a diferencia del cliente, que además distingue
 * `sin_reporte`) + uno para equipos dados de baja — el handoff sólo pide
 * EN LÍNEA / SIN CONTACTO / DADO DE BAJA en esta pantalla. */
export type DeviceDirectoryEstado = "en_linea" | "sin_contacto" | "dado_de_baja";
export type DeviceDirectorySegment = "todos" | "sin_contacto" | "con_alertas" | "consumible_bajo" | "sin_agente";
export type DeviceDirectorySortField = "last_seen" | "alerts_count";
export type SortDir = "asc" | "desc";

export interface DeviceDirectoryRow {
  id: string;
  client_id: string;
  client_name: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  ip_address: string | null;
  agent_id: string | null;
  agent_name: string | null;
  estado: DeviceDirectoryEstado;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  consumible_pct: number | null;
  last_seen: string | null;
  decommissioned_at: string | null;
  alerts_count: number;
}

/** Un cluster de filas contiguas de la página actual que pertenecen al mismo
 * cliente — `device_count_total`/`open_alerts_count` son del cliente ENTERO
 * (no sólo lo que entra en esta página), `device_count_in_view` respeta el
 * filtro/búsqueda activo pero no la paginación. */
export interface DeviceDirectoryGroup {
  id: string;
  name: string;
  device_count_total: number;
  device_count_in_view: number;
  open_alerts_count: number;
  rows: DeviceDirectoryRow[];
}

export interface DeviceDirectoryResponse {
  groups: DeviceDirectoryGroup[];
  /** Total de FILAS de dispositivo que matchean el filtro (paginación es por
   * dispositivo, no por cliente — ver docblock de `listDirectory`). */
  total: number;
}

/** Tira de 5 métricas del header (handoff hifi) — endpoint aparte
 * (`GET /devices/summary`), independiente del listado paginado. */
export interface DeviceInventorySummary {
  devices_total: number;
  devices_managed: number;
  reporting_24h: number;
  no_contact: number;
  supply_critical: number;
  supply_low: number;
  decommissioned: number;
  clients_total: number;
}
