/**
 * Volumen del período por dispositivo — modelo de LECTURA (read model) tal
 * como sale de la consulta LAG-based de `PeriodUsageQuery`. Se mantiene en
 * snake_case a propósito: es la forma de wire de `GET /clients/:id/reports/
 * preview` y la consume también `modules/scheduled-reports` (renderer de
 * tablas) — no es un agregado del dominio, es el resultado de una consulta.
 */
export interface PeriodUsageLine {
  device_id: string;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  agent_id: string | null;
  agent_name: string | null;
  source: string | null;
  first_reading_at: Date | null;
  first_total: number | null;
  first_mono: number | null;
  first_color: number | null;
  last_reading_at: Date | null;
  last_total: number | null;
  last_mono: number | null;
  last_color: number | null;
  delta_total: number;
  delta_mono: number;
  delta_color: number;
  had_counter_reset: boolean;
}
