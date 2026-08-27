export interface PageParams { limit: number; offset: number }

export interface PublicApiDeviceRow {
  id: string; name: string; serial_number: string | null; ip_address: string | null;
  hostname: string | null; location: string | null; sku: string | null; active: boolean; last_seen: string | null;
}

export interface PublicApiReadingRow {
  time: string; total_pages: number | null; mono_pages: number | null; color_pages: number | null; offline: boolean;
}

export interface PublicApiAlertRow {
  id: number; type: string; severity: string; message: string | null; resolved: boolean;
  created_at: string; device_id: string | null; device_name: string | null;
}

export interface PublicApiReportClosureRow {
  id: string; period: string; status: string; closed_at: string | null; reopened_at: string | null;
  superseded_by: string | null; total_pages: number; total_mono: number; total_color: number;
}

export interface PublicApiReportClosureLineRow {
  device_id: string; device_serial: string | null; device_model: string | null; device_brand: string | null;
  first_reading_at: string | null; first_total_pages: number | null; first_mono_pages: number | null; first_color_pages: number | null;
  last_reading_at: string | null; last_total_pages: number | null; last_mono_pages: number | null; last_color_pages: number | null;
  delta_total: number | null; delta_mono: number | null; delta_color: number | null; had_counter_reset: boolean;
}

/** Puerto de lectura de la API pública (integración ERP) — implementado
 * sobre Knex en `infrastructure/database`. Scope siempre fijo al cliente de
 * la API key (nunca "todos"), a diferencia del scope de portal. */
export interface PublicApiRepository {
  listDevices(clientId: string, page: PageParams): Promise<PublicApiDeviceRow[]>;
  findOwnedDevice(clientId: string, deviceId: string): Promise<{ id: string } | undefined>;
  listDeviceReadings(deviceId: string, filters: { from?: Date; to?: Date; limit: number }): Promise<PublicApiReadingRow[]>;
  listAlerts(clientId: string, filters: { resolved?: boolean }, page: PageParams): Promise<PublicApiAlertRow[]>;
  listReportClosures(clientId: string, page: PageParams): Promise<PublicApiReportClosureRow[]>;
  findReportClosure(clientId: string, closureId: string): Promise<PublicApiReportClosureRow | undefined>;
  listReportClosureLines(closureId: string): Promise<PublicApiReportClosureLineRow[]>;
}
