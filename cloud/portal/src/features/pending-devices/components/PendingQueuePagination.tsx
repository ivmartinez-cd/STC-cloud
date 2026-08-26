import { fmt } from '../../../shared/lib/formatters';
import { PAGE_SIZE } from '../hooks/usePendingQueue';

const PREV_BTN = 'rounded-[3px] border border-line-avatar px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-200 transition-colors duration-150 ease-in-out disabled:cursor-default enabled:border-line-300 enabled:text-ink-600 enabled:hover:bg-surface-btn-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';
const NEXT_BTN = 'rounded-[3px] border border-line-300 px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:cursor-default disabled:border-line-avatar disabled:text-ink-200 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2';

/** Ventana de páginas con elipsis — reimplementado localmente a propósito
 * (`ClientsPagination.tsx`/`DeviceInventoryPagination.tsx` tienen el mismo
 * helper): cruzar features está prohibido (`arch-portal`). */
function pageWindow(current: number, totalPages: number): Array<number | 'ellipsis'> {
  const withEnds = new Set<number>([0, totalPages - 1]);
  for (let i = Math.max(0, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) withEnds.add(i);
  const sorted = Array.from(withEnds).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  let prev: number | null = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push('ellipsis');
    result.push(p);
    prev = p;
  }
  return result;
}

function PageButtons({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  return (
    <>
      {pageWindow(page, totalPages).map((p, i) => p === 'ellipsis' ? (
        <span key={`e${i}`} className="px-1 font-sans text-xs text-ink-200">…</span>
      ) : (
        <button
          key={p} type="button" onClick={() => onPageChange(p)} aria-current={p === page ? 'page' : undefined}
          className={`rounded-[3px] px-[11px] py-[7px] font-montserrat text-[10.5px] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
            p === page ? 'bg-brand-soft font-bold text-brand-accent' : 'font-semibold text-ink-100 hover:bg-surface-btn-hover'
          }`}
        >
          {p + 1}
        </button>
      ))}
    </>
  );
}

/** "1–9 de 33 pendientes · 6 esperando más de 7 días" (handoff hifi). */
function SummaryText({ from, to, total, waiting7dPlus }: { from: number; to: number; total: number; waiting7dPlus: number }) {
  return (
    <div className="font-sans text-xs text-ink-400">
      {fmt(from)}–{fmt(to)} de {fmt(total)} pendientes · {fmt(waiting7dPlus)} esperando más de 7 días
    </div>
  );
}

interface Props {
  page: number;
  totalPages: number;
  total: number;
  waiting7dPlus: number;
  onPageChange: (p: number) => void;
}

export default function PendingQueuePagination({ page, totalPages, total, waiting7dPlus, onPageChange }: Props) {
  if (total === 0) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
      <SummaryText from={from} to={to} total={total} waiting7dPlus={waiting7dPlus} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)} className={PREV_BTN}>ANTERIOR</button>
        <PageButtons page={page} totalPages={totalPages} onPageChange={onPageChange} />
        <button type="button" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} className={NEXT_BTN}>SIGUIENTE</button>
      </div>
    </div>
  );
}
