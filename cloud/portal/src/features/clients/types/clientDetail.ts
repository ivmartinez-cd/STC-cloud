// Detalle de cliente hifi (handoff "Cliente — detalle", 25/08/2026) — tipos del
// wire de `GET /clients/:id/stats` y `GET /clients/:id/devices/directory`.
// `estado`/`consumible_pct`/`alerts_count` se calculan en el SERVIDOR
// (`KnexClientRepository`), nunca acá — mismo criterio que `clientsDirectory.ts`.

export interface ClientDetailStats {
  managed_device_count: number;
  alerts_open_count: number;
  alerts_availability_count: number;
}

export type ClientDeviceEstado = 'en_linea' | 'sin_conexion' | 'sin_reporte';
export type ClientDeviceSegment = 'todos' | 'sin_conexion' | 'con_alertas' | 'consumible_bajo';
export type ClientDeviceSortField = 'alerts_count' | 'consumible_pct' | 'last_seen';
export type SortDir = 'asc' | 'desc';

export interface ClientDeviceDirectoryRow {
  id: string;
  brand: string | null;
  model: string | null;
  name: string | null;
  serial_number: string | null;
  location: string | null;
  last_seen: string | null;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  estado: ClientDeviceEstado;
  consumible_pct: number | null;
  alerts_count: number;
}

export interface ClientDeviceDirectoryResponse {
  items: ClientDeviceDirectoryRow[];
  total: number;
}

/** `GET /devices/duplicates?client_id=` — columnas nuevas (marca/modelo/nombre +
 * `detected_at`) aditivas al shape que ya usaba `MergeDeviceModal.tsx`. */
export interface DuplicateCandidate {
  a_id: string; a_serial: string | null; a_mac: string | null; a_ip: string | null;
  a_brand: string | null; a_model: string | null; a_name: string | null;
  b_id: string; b_serial: string | null; b_mac: string | null; b_ip: string | null;
  b_brand: string | null; b_model: string | null; b_name: string | null;
  reason: string;
  detected_at: string | null;
}

export type ClientDetailTab = 'resumen' | 'dispositivos' | 'alertas' | 'consumibles' | 'configuracion';
