// Listado hifi "Inventario de dispositivos" (handoff 25/08/2026) — tipos del wire de
// `GET /devices/directory` y `GET /devices/summary`. `estado`/`consumible_pct`/
// `alerts_count` se calculan en el SERVIDOR (`KnexDeviceRepository`), nunca acá —
// mismo criterio que `clientsDirectory.ts`.

export type DeviceDirectoryEstado = 'en_linea' | 'sin_contacto' | 'dado_de_baja';
export type DeviceDirectorySegment = 'todos' | 'sin_contacto' | 'con_alertas' | 'consumible_bajo' | 'sin_agente';
export type DeviceDirectorySortField = 'last_seen' | 'alerts_count';
export type SortDir = 'asc' | 'desc';

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
  total: number;
}

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
