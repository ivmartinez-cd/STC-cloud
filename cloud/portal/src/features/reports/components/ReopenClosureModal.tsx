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
    <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[32px] max-w-sm w-full p-8 border border-slate-100 shadow-2xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><RefreshCw size={22} /></div>
          <div>
            <h3 className="text-lg font-extrabold text-[#1a2333]">Reabrir cierre</h3>
            <p className="text-xs text-slate-500 font-medium">Período {target.period.slice(0, 7)}</p>
          </div>
        </div>
        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Motivo (opcional)</label>
        <textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} rows={3}
          className="cd-input w-full mt-2 mb-6 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm" />
        <div className="flex items-center gap-3">
          <button onClick={onCancel} disabled={reopening}
            className="flex-1 px-5 py-3 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2">
            <X size={14} /> Cancelar
          </button>
          <button onClick={onConfirm} disabled={reopening}
            className="flex-1 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {reopening ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />} Reabrir
          </button>
        </div>
      </div>
    </div>
  );
}
