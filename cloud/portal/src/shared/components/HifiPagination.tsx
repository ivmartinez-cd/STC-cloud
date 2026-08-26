import { fmt } from '../lib/formatters';

/** Ventana de páginas con elipsis (primera, última, y 1 alrededor de la actual) —
 * evita renderizar 20+ botones cuando el listado tiene cientos de páginas. */
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

function PageButton({ p, active, onClick }: { p: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={`rounded-[3px] px-[11px] py-[7px] font-montserrat text-[10.5px] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
        active ? 'bg-brand-soft font-bold text-brand-accent' : 'font-semibold text-ink-100 hover:bg-surface-btn-hover'
      }`}
    >
      {p + 1}
    </button>
  );
}

function PageWindowButtons({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  return (
    <>
      {pageWindow(page, totalPages).map((p, i) =>
        p === 'ellipsis'
          ? <span key={`e${i}`} className="px-1 font-sans text-xs text-ink-200">…</span>
          : <PageButton key={p} p={p} active={p === page} onClick={() => onPageChange(p)} />
      )}
    </>
  );
}

function PrevButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className="rounded-[3px] border border-line-avatar px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-200 transition-colors duration-150 ease-in-out disabled:cursor-default enabled:border-line-300 enabled:text-ink-600 enabled:hover:bg-surface-btn-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      ANTERIOR
    </button>
  );
}

function NextButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className="rounded-[3px] border border-line-300 px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:cursor-default disabled:border-line-avatar disabled:text-ink-200 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      SIGUIENTE
    </button>
  );
}

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (p: number) => void;
}

/** Paginación genérica con ventana + elipsis (handoff hifi #3, 26/08/2026) —
 * extraída de `features/clients/components/ClientsPagination.tsx`, replicada
 * hasta ahora en 6 copias. `SimplePagination` (shared/, legacy) NO se
 * reemplaza acá — sigue siendo la que usan Pedidos/Correo hasta que esas
 * pantallas se migren en sus fases; queda documentada como "no usar en
 * pantallas hifi nuevas". */
export default function HifiPagination({ page, totalPages, total, pageSize, itemLabel, onPageChange }: Props) {
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
      <div className="font-sans text-xs text-ink-400">{fmt(from)}–{fmt(to)} de {fmt(total)} {itemLabel}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PrevButton disabled={page === 0} onClick={() => onPageChange(page - 1)} />
        <PageWindowButtons page={page} totalPages={totalPages} onPageChange={onPageChange} />
        <NextButton disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} />
      </div>
    </div>
  );
}
