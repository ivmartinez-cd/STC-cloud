import { Radio, Shield, Bell } from 'lucide-react';
import type { Thresholds } from '../../types/settings';

export default function MonitorThresholdCard({ thresholds, onChange, disabled }: { thresholds: Thresholds; onChange: (t: Thresholds) => void; disabled?: boolean }) {
  return (
    <div className="cd-panel p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-brand/10 text-brand rounded-2xl">
          <Bell size={24} />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-[#1a2333]">Monitoreo de Estado</h3>
          <p className="text-xs text-slate-500 font-medium">Define cuándo un monitor se considera fuera de línea.</p>
        </div>
      </div>

      <div className="max-w-md bg-slate-50/50 p-6 rounded-2xl border border-slate-50">
        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1 block mb-2">
          Tiempo de Inactividad (Minutos)
        </label>
        <div className="relative">
          <Radio size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="number"
            min={1}
            max={1440}
            value={thresholds.monitorOfflineMinutes}
            onChange={e => onChange({ monitorOfflineMinutes: Number(e.target.value) })}
            disabled={disabled}
            className="cd-input w-full !pl-12 !bg-white border-transparent focus:!border-brand disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder=""
          />
        </div>
        <div className="mt-4 flex items-start gap-2 px-1">
          <Shield size={12} className="text-brand-muted mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
            Si el sistema no recibe un "heartbeat" del monitor durante este intervalo,
            se disparará automáticamente el estado <span className="text-rose-500 font-bold uppercase tracking-tighter">Offline</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
