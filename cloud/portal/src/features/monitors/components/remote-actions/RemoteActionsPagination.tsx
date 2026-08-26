import { fmt } from '../../../../shared/lib/formatters';
import { REMOTE_ACTIONS_PAGE_SIZE } from '../../hooks/useRemoteActionsDirectory';

/** Ventana de páginas con elipsis — mismo criterio que `ClientsPagination`
 * (no se reusa directamente: `arch-portal` prohíbe imports entre features). */
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

function PrevButton({ page, onPageChange }: { page: number; onPageChange: (p: number) => void }) {
  return (
    <button
      type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}
      className="rounded-[3px] border border-line-avatar px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-200 transition-colors duration-150 ease-in-out disabled:cursor-default enabled:border-line-300 enabled:text-ink-600 enabled:hover:bg-surface-btn-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      ANTERIOR
    </button>
  );
}

function NextButton({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  return (
    <button
      type="button" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}
      className="rounded-[3px] border border-line-300 px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:cursor-default disabled:border-line-avatar disabled:text-ink-200 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      SIGUIENTE
    </button>
  );
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

export default function RemoteActionsPagination({
  page, totalPages, total, onPageChange,
}: {
  page: number; totalPages: number; total: number; onPageChange: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = page * REMOTE_ACTIONS_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * REMOTE_ACTIONS_PAGE_SIZE, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
      <div className="font-sans text-xs text-ink-400">{fmt(from)}–{fmt(to)} de {fmt(total)} lotes</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PrevButton page={page} onPageChange={onPageChange} />
        <PageButtons page={page} totalPages={totalPages} onPageChange={onPageChange} />
        <NextButton page={page} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
