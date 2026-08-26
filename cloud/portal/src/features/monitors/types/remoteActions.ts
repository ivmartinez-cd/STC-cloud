// Rediseño hifi "Acciones remotas" (handoff "4 pantallas", 25/08/2026) — tipos
// del wire de `GET /remote-actions`, `/remote-actions/summary` y
// `/remote-actions/by-type`. Toda cifra derivada (tasas, %, la falla
// sistémica del banner) se calcula en el SERVIDOR — acá sólo tipos + la
// copia de UI (label/subtítulo/color) que es puramente visual y no
// pertenece al backend.

export interface RemoteActionBatchRow {
  id: string;
  number: number;
  action: string;
  name: string | null;
  scheduled_at: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  total_items?: number;
}

export interface RemoteActionBatchItem {
  agent_id: string;
  agent_name: string | null;
  device_id: string | null;
  device_ip: string | null;
  device_label: string | null;
  command_status: string | null;
}

export interface RemoteActionBatchDetail extends RemoteActionBatchRow {
  items: RemoteActionBatchItem[];
}

export interface RemoteActionListResponse {
  items: RemoteActionBatchRow[];
  total: number;
}

export interface AgentOption { id: string; name: string; status: string; }
export interface ClientOption { id: string; name: string; }
export interface DeviceOption { id: string; serial_number: string | null; model: string | null; name: string | null; }

export interface RemoteActionSummary {
  window_days: number;
  total_7d: number;
  total_all_time: number;
  success_rate_pct: number;
  with_errors_count: number;
  with_errors_pct: number;
  in_progress_count: number;
  in_progress_sent: number;
  in_progress_queued: number;
}

export interface RemoteActionTypeBreakdown {
  action: string;
  total: number;
  completed: number;
  errors: number;
  cancelled: number;
  success_rate_pct: number;
  error_rate_pct: number;
}

export interface RemoteActionDiagnostic {
  action: string;
  label: string;
  failed_count: number;
  total_count: number;
  probable_cause: string;
}

export interface RemoteActionByTypeResponse {
  window_days: number;
  total_7d: number;
  types: RemoteActionTypeBreakdown[];
  diagnostic: RemoteActionDiagnostic | null;
}

export type RemoteActionSegment = 'todos' | 'con_errores' | 'en_curso' | 'cancelados' | 'hoy';
export type SortDir = 'asc' | 'desc';

/** Los 5 tipos reales (backend `REMOTE_ACTIONS`) — label igual al de
 * `REMOTE_ACTION_CATALOG` del backend (mismo criterio que `STATUS_LABELS`
 * local: es texto estático, no necesita ida y vuelta al servidor). */
export const ACTION_LABELS: Record<string, string> = {
  RESCAN: 'Re-escanear red',
  FORCE_SCAN: 'Forzar lectura ahora',
  RESTART: 'Reiniciar agente',
  FORCE_UPDATE: 'Forzar actualización',
  RESTART_PRINTER: 'Reiniciar impresora (SNMP)',
};

/** Subtítulo bajo la etiqueta en la columna ACCIÓN — qué hace cada tipo. */
export const ACTION_SUBTITLES: Record<string, string> = {
  RESCAN: 'Barrido de subredes',
  FORCE_SCAN: 'Lectura inmediata de contadores',
  RESTART: 'Reinicio del servicio del agente en el host',
  FORCE_UPDATE: 'Descarga e instalación de la versión más reciente del agente',
  RESTART_PRINTER: 'Reinicio remoto por SNMP',
};

/** Color de la barra vertical de 3px de la columna ACCIÓN — var(--color-*)
 * del tema institucional (nunca un hex suelto). */
export const ACTION_ACCENT_COLOR: Record<string, string> = {
  RESCAN: 'var(--color-brand-gray)',
  FORCE_SCAN: 'var(--color-ink-500)',
  RESTART: 'var(--color-ink-700)',
  FORCE_UPDATE: 'var(--color-ink-400)',
  RESTART_PRINTER: 'var(--color-brand-severe)',
};

/** Único que targetea EQUIPOS en vez de agentes — agente v1.2.0, SNMP SET real. */
export const DEVICE_TARGETED_ACTIONS = new Set(['RESTART_PRINTER']);

export const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  sent: 'Enviado',
  completed: 'Completado',
  completed_with_errors: 'Completado con errores',
  cancelled: 'Cancelado',
};

export function deviceLabelOf(d: DeviceOption): string {
  return d.name || d.serial_number || d.model || d.id;
}
