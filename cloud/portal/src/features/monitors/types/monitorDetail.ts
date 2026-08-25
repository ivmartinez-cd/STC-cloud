// Detalle de MONITOR hifi (handoff "Monitor — detalle", 25/08/2026) — tipos del
// wire de `GET /agents/:id/stats`, `/connectivity`, `/activity`, `/license` y
// `/devices/directory`. Todo lo derivado (`estado`/`consumible_pct`/`alerts_count`/
// conectividad/actividad) se calcula en el SERVIDOR (`KnexAgentPortalRepository`),
// nunca acá — mismo criterio que `clientDetail.ts` en el módulo `clients`.

/** Tira de 6 métricas del sitio (header de identidad del monitor). */
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
  /** `null` si nunca corrió un barrido (RESCAN/FORCE_SCAN) exitoso para este agente. */
  last_sweep_at: string | null;
  last_sweep_new_count: number;
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
