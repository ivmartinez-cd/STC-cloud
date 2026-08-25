// Listado hifi de "Clientes" (handoff 25/08/2026) — tipos del wire de
// `GET /clients/directory` y `GET /clients/summary`. `estado` y las columnas
// nuevas (alertas/último reporte) se calculan en el SERVIDOR
// (`KnexClientRepository.listDirectory`), nunca acá.

export type ClientEstado = 'activo' | 'sin_contacto' | 'sin_reporte';
export type ClientSegment = 'todos' | 'sin_contacto' | 'con_alertas' | 'sin_reporte_24h';
export type ClientSortField = 'monitor_count' | 'device_count' | 'alerts_count' | 'last_report_at';
export type SortDir = 'asc' | 'desc';

export interface ClientDirectoryRow {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  country: string | null;
  monitor_count: number;
  device_count: number;
  alerts_count: number;
  last_report_at: string | null;
  estado: ClientEstado;
}

export interface ClientDirectoryResponse {
  items: ClientDirectoryRow[];
  total: number;
}

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
