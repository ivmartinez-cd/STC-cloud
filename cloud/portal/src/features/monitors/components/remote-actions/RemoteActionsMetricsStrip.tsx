import { fmt } from '../../../../shared/lib/formatters';
import type { RemoteActionSummary } from '../../types/remoteActions';

function Cell({ label, value, note, accent, first, progressPct }: {
  label: string; value: string; note?: string; accent?: boolean; first: boolean; progressPct?: number;
}) {
  return (
    <div className={`bg-white px-6 py-4 ${first ? '' : 'border-l border-line-100'}`}>
      <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{label}</div>
      <div className={`mt-1 font-montserrat text-[21px] font-bold leading-[1.2] tabular-nums ${accent ? 'text-brand-severe' : 'text-ink-900'}`}>
        {value}
      </div>
      {progressPct !== undefined
        ? <div className="mt-2 h-1 overflow-hidden rounded-[3px] bg-surface-track"><div className="h-full rounded-[3px] bg-brand" style={{ width: `${Math.max(progressPct, 2)}%` }} /></div>
        : <div className="mt-1 font-sans text-[11px] leading-[1.3] text-ink-300">{note}</div>}
    </div>
  );
}

function MetricsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-8 text-center">
      <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
      <button
        type="button" onClick={onRetry}
        className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        Reintentar
      </button>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-[5px] border border-line-100 bg-white sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`px-6 py-4 ${i === 0 ? '' : 'border-l border-line-100'}`}>
          <span className="mb-2 block h-2 w-2/3 animate-pulse rounded bg-surface-track" />
          <span className="block h-[21px] w-1/2 animate-pulse rounded bg-surface-track" />
        </div>
      ))}
    </div>
  );
}

/** Tira de 4 métricas de "Acciones remotas" (handoff hifi "4 pantallas",
 * 25/08/2026) — columna izquierda del grid `auto-fit` junto a
 * `RemoteActionsByTypeCard`. Todo derivado ya viene calculado por
 * `GET /remote-actions/summary`. */
export default function RemoteActionsMetricsStrip({ summary, loading, error, onRetry }: {
  summary: RemoteActionSummary | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) return <MetricsError onRetry={onRetry} />;
  if (loading || !summary) return <MetricsSkeleton />;
  return (
    <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-[5px] border border-line-100 bg-white sm:grid-cols-4">
      <Cell first label="LOTES 7 DÍAS" value={fmt(summary.total_7d)} note={`${fmt(summary.total_all_time)} acumulados`} />
      <Cell first={false} label="TASA DE ÉXITO" value={`${summary.success_rate_pct}%`} progressPct={summary.success_rate_pct} />
      <Cell first={false} label="CON ERRORES" value={fmt(summary.with_errors_count)} accent={summary.with_errors_count > 0} note={`${summary.with_errors_pct}% de los lotes`} />
      <Cell first={false} label="EN CURSO" value={fmt(summary.in_progress_count)} note={`${fmt(summary.in_progress_sent)} enviados · ${fmt(summary.in_progress_queued)} en cola`} />
    </div>
  );
}
