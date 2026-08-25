/**
 * Tipos del detalle de monitor hifi (handoff "Monitor — detalle", 25/08/2026) —
 * mismo criterio que `ClientDetailStats`/`ClientDeviceDirectoryRow` en el módulo
 * `clients`: read models snake_case computados en el REPO (nunca en el front).
 */

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
  last_sweep_at: Date | null;
  /** Equipos con `created_at >= last_sweep_at` — proxy real (no fabricado) de
   * "nuevos en el último barrido": no hay vínculo directo comando→dispositivo,
   * pero un equipo creado a partir del último barrido exitoso es, por
   * definición, uno que ese barrido detectó por primera vez. */
  last_sweep_new_count: number;
}

export type ConnectivityDayStatus = "online" | "parcial" | "sin_contacto";

/**
 * Un día de la tira "Conectividad · últimos 30 días". APROXIMACIÓN DOCUMENTADA:
 * no existe un log estructurado de conectividad día-a-día — se deriva agregando,
 * por día calendario (UTC), el tiempo cubierto por alertas `agent_offline`
 * abiertas/cerradas de este agente (`heartbeatMonitor.ts` ya las abre/cierra en
 * tiempo real, así que reflejan la señal real de caídas). Un día se marca:
 * - `online` si no hubo ningún minuto de caída ese día calendario.
 * - `sin_contacto` si la caída cubrió ~el día completo (≥23 h) — incluye los
 *   días anteriores a la creación del agente (`agents.created_at`), donde no
 *   pudo haber contacto por definición.
 * - `parcial` en cualquier otro caso con caída parcial.
 */
export interface ConnectivityDay {
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  status: ConnectivityDayStatus;
  downtime_minutes: number;
  /** Alertas `agent_offline` resueltas dentro de este día calendario. */
  reconnects: number;
}

export type AgentActivityKind = "barrido" | "incidencia" | "administrativo";

/**
 * Evento de "Actividad reciente". Se compone de 3 fuentes reales (ninguna
 * inventada): alertas abiertas/resueltas de este agente y sus equipos
 * (`alerts`), acciones administrativas auditadas sobre este agente
 * (`audit_logs.target_id`) y comandos remotos completados (`agent_commands`).
 */
export interface AgentActivityEvent {
  id: string;
  kind: AgentActivityKind;
  text: string;
  at: Date;
}

export type AgentDeviceEstado = "en_linea" | "sin_conexion" | "sin_aprobar";
export type AgentDeviceSegment = "sin_conexion" | "con_alertas" | "sin_aprobar";
export type AgentDeviceSortField = "alerts_count" | "consumible_pct" | "last_seen";

export interface AgentDeviceDirectoryQuery {
  agentId: string;
  /** Busca en serie, modelo e IP (README: "Buscar por serie, modelo o IP…"). */
  q?: string;
  segment?: AgentDeviceSegment;
  sortField?: AgentDeviceSortField;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Fila de "Equipos detectados por este monitor" — paginada/filtrada/ordenada
 * server-side, mismo patrón que `ClientDeviceDirectoryRow` pero scopeada por
 * `agent_id` en vez de `client_id`, e incluye equipos `pending` (sin aprobar). */
export interface AgentDeviceDirectoryRow {
  id: string;
  brand: string | null;
  model: string | null;
  name: string | null;
  serial_number: string | null;
  ip_address: string | null;
  last_seen: Date | null;
  estado: AgentDeviceEstado;
  consumible_pct: number | null;
  alerts_count: number;
}

/**
 * "Licencia y vínculo" del monitor. No existe un concepto de "licencia" propio
 * en el dominio (sólo `activation_key`/`activation_expires_at`, que expiran a
 * las 24 h y sólo importan ANTES de la activación) — `emitida_at` es la fecha
 * de alta real del agente (`agents.created_at`); `proxima_rotacion_at` es una
 * PROYECCIÓN determinística sobre la política fija de rotación de 90 días que
 * ya es copy estático del hifi ("rotación cada 90 días"), no un dato inventado:
 * `emitida_at + N×90 días` hasta caer en el futuro.
 */
export interface AgentLicense {
  estado: "vigente" | "revocada";
  hardware_id: string | null;
  emitida_at: Date;
  proxima_rotacion_at: Date;
  rotacion_dias: number;
  organizacion: { id: string; nombre: string; device_count: number; monitor_count: number };
}
