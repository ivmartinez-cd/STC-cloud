import type { RemoteAction } from "./remote-action-batch";

/**
 * Agregaciones de sólo lectura para la pantalla "Acciones remotas" (handoff
 * hifi "4 pantallas", 25/08/2026): tira de métricas de 7 días, resultado por
 * tipo de acción, y el banner de diagnóstico. Todo lo derivado (tasas,
 * porcentajes, la detección de falla sistémica) se calcula acá o en el
 * repositorio — nunca en el frontend (regla del README: "toda cifra derivada
 * calculada en el servidor").
 */

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

/** Un tipo de acción dentro de la ventana. Las tasas son sobre lotes ya
 * TERMINADOS (completado + con errores + cancelado) — un lote todavía en
 * curso no tiene resultado que aportar a la barra de 3 segmentos. */
export interface RemoteActionTypeBreakdown {
  action: RemoteAction;
  total: number;
  completed: number;
  errors: number;
  cancelled: number;
  success_rate_pct: number;
  error_rate_pct: number;
}

export interface RemoteActionDiagnostic {
  action: RemoteAction;
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
