// Detalle de MONITOR hifi (handoff "Monitor — detalle", 25/08/2026) — tipos del
// wire de `GET /agents/:id/stats`, `/connectivity`, `/activity`, `/license` y
// `/devices/directory`. Todo lo derivado (`estado`/`consumible_pct`/`alerts_count`/
// conectividad/actividad) se calcula en el SERVIDOR (`KnexAgentPortalRepository`),
// nunca acá — mismo criterio que `clientDetail.ts` en el módulo `clients`.

/**
 * Progreso del barrido AUTOMÁTICO de discovery, tal como lo reporta el propio
 * agente en cada heartbeat (`agents.discovery_state`, jsonb). El agente recorre
 * sus rangos de forma continua por chunks con cursor, así que una "vuelta"
 * (lap) es un recorrido completo de las IPs declaradas, no un comando puntual.
 *
 * OJO: no es lo mismo que `AgentStats.last_sweep_at`, que sale de un
 * `RESCAN`/`FORCE_SCAN` MANUAL. Son dos conceptos que conviven y la ficha
 * "Estado del monitor" (`MonitorSpecsCard`) los muestra en filas separadas
 * ("BARRIDO AUTOMÁTICO" / "BARRIDO MANUAL"), a propósito.
 */
export interface AgentDiscoveryState {
  /** Hay una vuelta en curso (si no, el agente espera el intervalo para arrancar otra). */
  in_progress: boolean;
  /** IPs recorridas en la vuelta EN CURSO (se reinicia en cada vuelta nueva). */
  scanned: number;
  /** IPs declaradas totales. */
  total: number;
  /** ISO 8601. */
  lap_started_at: string | null;
  /** ISO 8601 — fin de la última vuelta COMPLETA. */
  last_lap_at: string | null;
  /** Duración en ms de la última vuelta completa. */
  last_lap_ms: number | null;
  laps_completed: number;
}

/** Métricas del sitio — las consumen `DeviceSummaryCard` y `MonitorSpecsCard`
 *  del Resumen (ya no hay una "tira": `MonitorMetricsStrip` estaba muerto y se
 *  borró al agregar el barrido automático). */
export interface AgentStats {
  devices_total: number;
  devices_active: number;
  devices_offline: number;
  alerts_open: number;
  alerts_availability: number;
  volume_month: number;
  uptime_30d_pct: number;
  outages_30d: number;
  downtime_30d_minutes: number;
  discovered_pending: number;
  /** BARRIDO MANUAL: `null` si nunca corrió un RESCAN/FORCE_SCAN exitoso para
   *  este agente. Nada que ver con el barrido automático (`discovery_state`). */
  last_sweep_at: string | null;
  last_sweep_new_count: number;
  /**
   * BARRIDO AUTOMÁTICO CONTINUO. Opcional a propósito: un agente sin
   * actualizar todavía no lo reporta (`null`) y una API anterior a este campo
   * ni siquiera lo manda (`undefined`) — en los dos casos `MonitorSpecsCard`
   * omite la fila entera y la ficha queda igual que antes.
   */
  discovery_state?: AgentDiscoveryState | null;
}

export type ConnectivityDayStatus = 'online' | 'parcial' | 'sin_contacto';

/** Un día de "Conectividad · últimos 30 días" — ver docblock de `ConnectivityDay`
 * en `cloud/src/modules/agents/domain/entities/monitor-detail.ts` para la
 * aproximación documentada (derivada de alertas `agent_offline`, no de un log
 * estructurado día-a-día). */
export interface ConnectivityDay {
  date: string;
  status: ConnectivityDayStatus;
  downtime_minutes: number;
  reconnects: number;
}

export type AgentActivityKind = 'barrido' | 'incidencia' | 'administrativo';

export interface AgentActivityEvent {
  id: string;
  kind: AgentActivityKind;
  text: string;
  at: string;
}

export interface AgentLicense {
  estado: 'vigente' | 'revocada';
  hardware_id: string | null;
  emitida_at: string;
  proxima_rotacion_at: string;
  rotacion_dias: number;
  organizacion: { id: string; nombre: string; device_count: number; monitor_count: number };
}

export type AgentDeviceEstado = 'en_linea' | 'sin_conexion' | 'sin_aprobar';
export type AgentDeviceSegment = 'todos' | 'sin_conexion' | 'con_alertas' | 'sin_aprobar';
export type AgentDeviceSortField = 'alerts_count' | 'consumible_pct' | 'last_seen';
export type SortDir = 'asc' | 'desc';

export interface AgentDeviceDirectoryRow {
  id: string;
  brand: string | null;
  model: string | null;
  name: string | null;
  serial_number: string | null;
  ip_address: string | null;
  last_seen: string | null;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  estado: AgentDeviceEstado;
  consumible_pct: number | null;
  alerts_count: number;
}

export interface AgentDeviceDirectoryResponse {
  items: AgentDeviceDirectoryRow[];
  total: number;
}
