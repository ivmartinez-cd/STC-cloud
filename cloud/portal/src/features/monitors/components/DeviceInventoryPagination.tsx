import { fmt } from '../../../shared/lib/formatters';
import { pageWindow } from './deviceInventoryHelpers';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
}

export default function DeviceInventoryPagination({ page, totalPages, total, from, to, onPageChange }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
      <div className="font-sans text-xs text-ink-400">{fmt(from)}–{fmt(to)} de {fmt(total)} equipos</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}
          className="rounded-[3px] border border-line-avatar px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-200 disabled:cursor-default enabled:border-line-300 enabled:text-ink-600 enabled:hover:bg-surface-btn-hover"
        >
          ANTERIOR
        </button>
        {pageWindow(page, totalPages).map((p, i) => p === 'ellipsis' ? (
          <span key={`e${i}`} className="px-1 font-sans text-xs text-ink-200">…</span>
        ) : (
          <button
            key={p} type="button" onClick={() => onPageChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`rounded-[3px] px-[11px] py-[7px] font-montserrat text-[10.5px] ${p === page ? 'bg-brand-soft font-bold text-brand-accent' : 'font-semibold text-ink-100 hover:bg-surface-btn-hover'}`}
          >
            {p + 1}
          </button>
        ))}
        <button
          type="button" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}
          className="rounded-[3px] border border-line-300 px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-600 hover:bg-surface-btn-hover disabled:cursor-default disabled:border-line-avatar disabled:text-ink-200 disabled:hover:bg-transparent"
        >
          SIGUIENTE
        </button>
      </div>
    </div>
  );
}
