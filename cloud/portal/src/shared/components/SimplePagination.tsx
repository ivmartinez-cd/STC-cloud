import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const BTN = 'p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all';

/**
 * Paginación simple con total real — para listados con el estilo Tailwind
 * "clásico" (slate/rounded-2xl) que todavía no migraron al sistema hifi
 * (`ink-*`/Montserrat) de las tablas más nuevas. A diferencia de esas, acá
 * no hace falta ventana de números de página: sólo prev/next + "X–Y de N".
 */
export default function SimplePagination({ page, pageSize, total, onPageChange }: Props) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-3">
        <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)} className={BTN}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Página {page + 1} de {totalPages}
        </span>
        <button type="button" disabled={page + 1 >= totalPages} onClick={() => onPageChange(page + 1)} className={BTN}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
