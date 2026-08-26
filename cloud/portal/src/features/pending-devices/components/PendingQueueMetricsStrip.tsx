import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import type { PendingQueueSummary } from '../types/pendingDevices';

interface Cell { label: string; value: string; note?: string; accent?: boolean }

/** Mes calendario en curso — el handoff hifi muestra "APROBADOS EN AGOSTO" porque
 * se diseñó en agosto, pero el label es dinámico (no queremos que en septiembre
 * siga diciendo "agosto"). */
function currentMonthLabel(): string {
  const name = new Date().toLocaleDateString(APP_LOCALE, { month: 'long' });
  return name.toUpperCase();
}

function buildCells(summary: PendingQueueSummary | null): Cell[] {
  return [
    { label: 'PENDIENTES TOTALES', value: fmt(summary?.pending_total ?? 0), accent: true, note: summary ? `en ${fmt(summary.pending_clients)} clientes` : undefined },
    { label: 'DESCUBIERTOS HOY', value: fmt(summary?.discovered_today ?? 0), note: summary ? `${fmt(summary.discovered_yesterday)} ayer` : undefined },
    { label: 'ESPERANDO +7 DÍAS', value: fmt(summary?.waiting_7d_plus ?? 0), accent: true, note: 'requieren decisión' },
    { label: 'POSIBLES DUPLICADOS', value: fmt(summary?.possible_duplicates ?? 0), accent: true, note: 'serie ya en inventario' },
    { label: `APROBADOS EN ${currentMonthLabel()}`, value: fmt(summary?.approved_this_month ?? 0), note: summary ? `${fmt(summary.ignored_this_month)} ignorados` : undefined },
  ];
}

function MetricCell({ cell, loading }: { cell: Cell; loading: boolean }) {
  return (
    <div className="bg-white px-[18px] pb-4 pt-[15px]">
      <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{cell.label}</div>
      {loading ? (
        <span className="mt-1.5 block h-[21px] w-3/5 animate-pulse rounded bg-surface-track" />
      ) : (
        <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${cell.accent ? 'text-brand-severe' : 'text-ink-900'}`}>{cell.value}</div>
      )}
      <div className="mt-[7px] font-sans text-[11px] leading-[1.3] text-ink-300">{loading ? ' ' : (cell.note ?? '')}</div>
    </div>
  );
}

function MetricsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-6 text-center">
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

interface Props {
  summary: PendingQueueSummary | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** Tira de 5 métricas (handoff hifi "Dispositivos pendientes", 25/08/2026) —
 * endpoint aparte (`GET /devices/pending/summary`), falla independiente de la
 * tabla. Mismo reflow 5→3→2→1 que `DeviceInventoryMetricsStrip.tsx`. */
export default function PendingQueueMetricsStrip({ summary, loading, error, onRetry }: Props) {
  if (error) return <MetricsErrorState onRetry={onRetry} />;
  const cells = buildCells(summary);
  return (
    <div className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {cells.map((c) => <MetricCell key={c.label} cell={c} loading={loading} />)}
    </div>
  );
}
