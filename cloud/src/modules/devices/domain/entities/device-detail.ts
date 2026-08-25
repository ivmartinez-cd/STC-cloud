/**
 * Read models del detalle de dispositivo hifi (handoff "Dispositivo — detalle",
 * 25/08/2026) — mismo criterio que `AgentStats`/`ConnectivityDay` en
 * `modules/agents/domain/entities/monitor-detail.ts`: computados en el REPO,
 * nunca en el front, para que no haya dos cifras contradictorias en pantalla.
 */

/** Consumible con menor % restante — `null` si ningún consumible reportó %. */
export interface DeviceLowestSupply {
  pct: number;
  label: string;
  remaining_pages: number | null;
}

/**
 * Atascos de los últimos 30 días. `tray_label` se extrae del texto de la
 * alerta más reciente (la tabla `alerts` no tiene columna de bandeja) — `null`
 * si el mensaje no menciona una bandeja identificable. Nunca se inventa una.
 */
export interface DeviceJamSummary {
  count_30d: number;
  last_at: Date | null;
  tray_label: string | null;
}

/** Tira de 6 métricas del header de identidad del equipo. */
export interface DeviceStats {
  total_counter: number;
  volume_month: number;
  /** % del volumen del sitio (mismo cálculo que `AgentStats.volume_month`) —
   * `null` si el sitio no imprimió nada este mes (evita división por cero). */
  volume_month_site_pct: number | null;
  mono_pages: number;
  mono_pct: number | null;
  color_pages: number;
  color_pct: number | null;
  lowest_supply: DeviceLowestSupply | null;
  jams: DeviceJamSummary;
}

export interface PrintTrendMonth {
  /** `YYYY-MM`. */
  month: string;
  month_date: Date;
  mono: number;
  color: number;
  total: number;
}

/**
 * "Tendencia de impresión · 12 meses". `months` siempre trae 12 filas (huecos
 * rellenados con 0 en el SQL, no en el front). `monthly_avg`/`peak`/
 * `projection_next_month` se computan sobre los meses COMPLETOS (se excluye
 * el corriente, que está a mitad) — ver `domain/services/print-trend.ts`.
 */
export interface PrintTrend {
  months: PrintTrendMonth[];
  monthly_avg: number;
  peak: { month: string; total: number } | null;
  projection_next_month: number | null;
}
