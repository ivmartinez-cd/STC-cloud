import { fmt } from '../../../../shared/lib/formatters';
import SegmentedBar from '../../../../shared/components/SegmentedBar';
import { ACTION_LABELS, type RemoteActionByTypeResponse, type RemoteActionTypeBreakdown } from '../../types/remoteActions';

const COLOR_COMPLETED = 'var(--color-brand-gray)';
const COLOR_ERRORS = 'var(--color-brand-severe)';
const COLOR_CANCELLED = 'var(--color-surface-track-alt)';

const LEGEND = [
  { label: 'Completado', color: COLOR_COMPLETED },
  { label: 'Con errores', color: COLOR_ERRORS },
  { label: 'Cancelado', color: COLOR_CANCELLED },
];

function segmentsOf(t: RemoteActionTypeBreakdown) {
  const terminal = t.completed + t.errors + t.cancelled;
  const pctOf = (n: number) => (terminal > 0 ? (n / terminal) * 100 : 0);
  return [
    { pct: pctOf(t.completed), color: COLOR_COMPLETED },
    { pct: pctOf(t.errors), color: COLOR_ERRORS },
    { pct: pctOf(t.cancelled), color: COLOR_CANCELLED },
  ];
}

function TypeRow({ t }: { t: RemoteActionTypeBreakdown }) {
  const detailColorCls = t.success_rate_pct >= 80 ? 'text-ink-100' : 'text-brand-accent';
  return (
    <div className="py-2.5">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-sans text-[12.5px] font-semibold text-ink-900">{ACTION_LABELS[t.action] ?? t.action}</span>
        <span className={`font-sans text-[11.5px] ${detailColorCls}`}>
          {t.success_rate_pct}% de éxito · {fmt(t.completed)} completados · {fmt(t.errors)} con errores · {fmt(t.cancelled)} cancelados
        </span>
      </div>
      <SegmentedBar segments={segmentsOf(t)} heightPx={6} />
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[5px] border border-line-100 bg-white" style={{ borderTop: '3px solid var(--color-brand-severe)' }}>
      {children}
    </div>
  );
}

function CardHeader({ total }: { total: number }) {
  return (
    <div className="flex items-baseline justify-between px-6 pt-4">
      <h2 className="font-montserrat text-[10.5px] font-bold uppercase tracking-[.13em] text-ink-600">Resultado por tipo de acción · 7 días</h2>
      <span className="font-montserrat text-[12.5px] font-bold tabular-nums text-ink-900">{fmt(total)} lotes</span>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-5 border-t border-line-150 px-6 py-3">
      {LEGEND.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5 font-sans text-[11.5px] text-ink-100">
          <span className="block h-[3px] w-[9px] rounded-full" style={{ background: l.color }} />
          {l.label}
        </span>
      ))}
    </div>
  );
}

function ByTypeError({ onRetry }: { onRetry: () => void }) {
  return (
    <CardShell>
      <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button
          type="button" onClick={onRetry}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Reintentar
        </button>
      </div>
    </CardShell>
  );
}

function ByTypeSkeleton() {
  return (
    <CardShell>
      <div className="space-y-3 px-6 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <span className="block h-3 w-2/5 animate-pulse rounded bg-surface-track" />
            <span className="block h-1.5 w-full animate-pulse rounded bg-surface-track" />
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function ByTypeContent({ byType }: { byType: RemoteActionByTypeResponse }) {
  if (byType.types.length === 0) {
    return (
      <CardShell>
        <CardHeader total={0} />
        <div className="px-6 py-8 text-center font-sans text-[12.5px] text-ink-300">Sin lotes en los últimos 7 días.</div>
      </CardShell>
    );
  }
  return (
    <CardShell>
      <CardHeader total={byType.total_7d} />
      <div className="divide-y divide-line-150 px-6">
        {byType.types.map((t) => <TypeRow key={t.action} t={t} />)}
      </div>
      <Legend />
    </CardShell>
  );
}

/** Bloque "Resultado por tipo de acción" (handoff hifi "4 pantallas") —
 * genérico sobre los tipos que tengan datos en la ventana: el backend real
 * tiene 5 tipos, la muestra del handoff sólo 3, así que nunca se asume una
 * cantidad fija. */
export default function RemoteActionsByTypeCard({ byType, loading, error, onRetry }: {
  byType: RemoteActionByTypeResponse | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) return <ByTypeError onRetry={onRetry} />;
  if (loading || !byType) return <ByTypeSkeleton />;
  return <ByTypeContent byType={byType} />;
}
