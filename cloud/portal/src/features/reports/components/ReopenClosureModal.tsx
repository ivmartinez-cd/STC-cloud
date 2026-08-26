import { RefreshCw, X, Unlock, Loader2 } from 'lucide-react';
import type { Closure } from '../types/reports';

interface Props {
  target: Closure;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  reopening: boolean;
}

export default function ReopenClosureModal({ target, reason, onReasonChange, onCancel, onConfirm, reopening }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c111d]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[5px] border border-line-100 bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-[3px] bg-brand-soft p-2.5 text-brand-accent"><RefreshCw size={20} /></div>
          <div>
            <h3 className="font-montserrat text-[16px] font-extrabold text-ink-900">Reabrir cierre</h3>
            <p className="font-sans text-[12px] text-ink-300">Período {target.period.slice(0, 7)}</p>
          </div>
        </div>
        <label className="ml-1 font-montserrat text-[9.5px] font-bold uppercase tracking-[.1em] text-ink-300">Motivo (opcional)</label>
        <textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} rows={3}
          className="mb-5 mt-2 w-full rounded-[3px] border border-line-100 bg-surface-input p-2.5 font-sans text-[13px] text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-brand" />
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onCancel} disabled={reopening} className="flex flex-1 items-center justify-center gap-2 rounded-[3px] border border-line-300 px-4 py-[11px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.1em] text-ink-600 hover:bg-surface-btn-hover disabled:opacity-50">
            <X size={14} /> Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={reopening} className="flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-[11px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.1em] text-white hover:bg-brand-severe disabled:opacity-50">
            {reopening ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />} Reabrir
          </button>
        </div>
      </div>
    </div>
  );
}
