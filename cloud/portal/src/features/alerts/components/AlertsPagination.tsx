import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE } from '../lib/alertPresentation';

interface Props { page: number; pageCount: number; onChange: (page: number) => void; }

const BTN = 'p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all';

/** Paginación "ciega" (sin total): siguiente se deshabilita cuando la página vino incompleta. */
const AlertsPagination = ({ page, pageCount, onChange }: Props) => (
  <div className="flex items-center justify-end gap-3">
    <button disabled={page === 0} onClick={() => onChange(Math.max(0, page - 1))} className={BTN}>
      <ChevronLeft size={16} />
    </button>
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Página {page + 1}</span>
    <button disabled={pageCount < PAGE_SIZE} onClick={() => onChange(page + 1)} className={BTN}>
      <ChevronRight size={16} />
    </button>
  </div>
);

export default AlertsPagination;
