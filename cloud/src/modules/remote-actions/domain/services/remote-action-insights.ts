import { REMOTE_ACTION_CATALOG } from "../entities/remote-action-catalog";
import type { RemoteAction } from "../entities/remote-action-batch";
import type {
  RemoteActionDiagnostic, RemoteActionSummary, RemoteActionTypeBreakdown,
} from "../entities/remote-action-insights";

/**
 * Cálculo puro de las agregaciones de "Acciones remotas" a partir de
 * recuentos por `status` ya agrupados por SQL (`KnexRemoteActionRepository`).
 * Separado del repositorio para no depender de Knex — mismo criterio que
 * `summarizePortfolioRows` en el módulo `clients`.
 */

/** Redondeado a entero — evita decimales ruidosos en chips/textos de la UI. */
function pctOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Recuentos por `status` dentro de la ventana (7 días por defecto) → tira
 * de métricas de la pantalla. */
export function summarizeStatusCounts(
  byStatus: Record<string, number>, totalAllTime: number, windowDays: number
): RemoteActionSummary {
  const total7d = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const completed = byStatus.completed ?? 0;
  const withErrors = byStatus.completed_with_errors ?? 0;
  const sent = byStatus.sent ?? 0;
  const scheduled = byStatus.scheduled ?? 0;
  return {
    window_days: windowDays, total_7d: total7d, total_all_time: totalAllTime,
    success_rate_pct: pctOf(completed, total7d),
    with_errors_count: withErrors, with_errors_pct: pctOf(withErrors, total7d),
    in_progress_count: sent + scheduled, in_progress_sent: sent, in_progress_queued: scheduled,
  };
}

/** Recuentos por `status` de UN tipo de acción dentro de la ventana → un
 * bloque de "Resultado por tipo de acción". */
export function summarizeTypeBreakdown(action: RemoteAction, byStatus: Record<string, number>): RemoteActionTypeBreakdown {
  const completed = byStatus.completed ?? 0;
  const errors = byStatus.completed_with_errors ?? 0;
  const cancelled = byStatus.cancelled ?? 0;
  const sent = byStatus.sent ?? 0;
  const scheduled = byStatus.scheduled ?? 0;
  const terminal = completed + errors + cancelled;
  return {
    action, total: terminal + sent + scheduled, completed, errors, cancelled,
    success_rate_pct: pctOf(completed, terminal), error_rate_pct: pctOf(errors, terminal),
  };
}

/** Falla sistémica (banner de diagnóstico): un tipo de acción con ≥80% de
 * error sobre ≥5 lotes terminados en la ventana es lo bastante consistente
 * como para señalar una causa raíz, no ruido puntual de 1-2 lotes. */
const SYSTEMIC_FAILURE_ERROR_RATE_THRESHOLD_PCT = 80;
const SYSTEMIC_FAILURE_MIN_BATCHES = 5;

export function detectSystemicFailure(types: RemoteActionTypeBreakdown[]): RemoteActionDiagnostic | null {
  const candidates = types.filter((t) => {
    const terminal = t.completed + t.errors + t.cancelled;
    return terminal >= SYSTEMIC_FAILURE_MIN_BATCHES && t.error_rate_pct >= SYSTEMIC_FAILURE_ERROR_RATE_THRESHOLD_PCT;
  });
  if (candidates.length === 0) return null;
  const worst = candidates.reduce((a, b) => (b.error_rate_pct > a.error_rate_pct ? b : a));
  const meta = REMOTE_ACTION_CATALOG[worst.action];
  return {
    action: worst.action, label: meta.label, failed_count: worst.errors,
    total_count: worst.completed + worst.errors + worst.cancelled,
    probable_cause: meta.probableCauseWhenFailing,
  };
}
