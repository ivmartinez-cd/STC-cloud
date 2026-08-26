import { fmt, fmtPct } from '../../../shared/lib/formatters';
import type { AuditSummary } from '../../../shared/types/audit';
import { categoryAccent } from '../lib/activityPresentation';
import CardError from '../../../shared/components/CardError';

function CategoryRow({ row, max, total }: { row: AuditSummary['by_category'][number]; max: number; total: number }) {
  const barPct = Math.max(1.5, max > 0 ? (row.count / max) * 100 : 0);
  const accent = categoryAccent(row.category);
  return (
    <div className="grid grid-cols-[8px_minmax(0,140px)_1fr_88px] items-center gap-[11px] border-b border-line-200 py-[7px] last:border-b-0">
      <span className={`block h-[7px] w-[7px] rounded-full ${accent}`} />
      <span className="truncate font-sans text-[12.5px] text-ink-700">{row.label}</span>
      <span className="block h-1.5 rounded-[3px] bg-surface-track">
        <span className={`block h-full rounded-[3px] ${accent}`} style={{ width: `${barPct}%` }} />
      </span>
      <span className="text-right font-sans text-[11.5px] text-ink-400">{fmt(row.count)} · {fmtPct(row.count, total)}</span>
    </div>
  );
}

interface Props { byCategory: AuditSummary['by_category']; total: number; loading: boolean; error: boolean; onRetry: () => void }

function PanelBody({ byCategory, total, loading, error, onRetry }: Props) {
  if (error) return <CardError onRetry={onRetry} />;
  if (loading) return <div className="h-[120px] animate-pulse rounded bg-surface-track" />;
  if (byCategory.length === 0) return <div className="py-6 text-center font-sans text-[12.5px] text-ink-300">Sin eventos en el rango</div>;
  const max = byCategory[0]?.count ?? 0;
  return <>{byCategory.slice(0, 5).map((row) => <CategoryRow key={row.category} row={row} max={max} total={total} />)}</>;
}

/** "Eventos por categoría" (handoff hifi #3, fase 5) — mismo patrón que
 * `AlertsByCodePanel`/`IncidentsByClassPanel`, top 5 categorías. */
export default function ActivityByCategoryPanel(props: Props) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-150 px-5 py-[14px]">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">EVENTOS POR CATEGORÍA</span>
        {!props.loading && !props.error && <span className="font-sans text-[11.5px] text-ink-300">{fmt(props.total)} en el rango</span>}
      </div>
      <div className="px-5 pb-4 pt-3"><PanelBody {...props} /></div>
    </div>
  );
}
