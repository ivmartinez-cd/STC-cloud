import type { ReactNode } from 'react';
import { Radio, Shield, Bell, Printer } from 'lucide-react';
import type { Thresholds } from '../types/settings';

function ThresholdField({ label, help, value, onChange, disabled, icon: Icon }: {
  label: string; help: ReactNode; value: number; onChange: (v: number) => void; disabled?: boolean;
  icon: typeof Radio;
}) {
  return (
    <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-50">
      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1 block mb-2">
        {label}
      </label>
      <div className="relative">
        <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="number"
          min={1}
          max={1440}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          disabled={disabled}
          className="cd-input w-full !pl-12 !bg-white border-transparent focus:!border-brand disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder=""
        />
      </div>
      <div className="mt-4 flex items-start gap-2 px-1">
        <Shield size={12} className="text-brand-muted mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{help}</p>
      </div>
    </div>
  );
}

/**
 * "Modelo unificado de umbrales" (26/08/2026): dos campos, no uno — el
 * umbral del AGENTE (heartbeat del proceso monitor) y el del EQUIPO
 * (última lectura de una impresora puntual, mayor porque el agente reduce
 * su propia frecuencia fuera de horario laboral). Antes sólo el primero
 * tenía control de UI; el segundo vivía hardcodeado en 4 lugares distintos
 * del backend/portal, todos leyendo ahora del mismo valor configurado acá.
 */
export default function MonitorThresholdCard({ thresholds, onChange, disabled }: { thresholds: Thresholds; onChange: (t: Thresholds) => void; disabled?: boolean }) {
  return (
    <div className="cd-panel p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-brand/10 text-brand rounded-2xl">
          <Bell size={24} />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-[#1a2333]">Monitoreo de Estado</h3>
          <p className="text-xs text-slate-500 font-medium">Define cuándo un monitor o un equipo se consideran fuera de línea.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <ThresholdField
          label="Monitor sin señal (minutos)"
          value={thresholds.monitorOfflineMinutes}
          onChange={(v) => onChange({ ...thresholds, monitorOfflineMinutes: v })}
          disabled={disabled}
          icon={Radio}
          help={<>Sin un "heartbeat" del monitor durante este intervalo, se dispara automáticamente el estado <span className="text-rose-500 font-bold uppercase tracking-tighter">Offline</span>.</>}
        />
        <ThresholdField
          label="Equipo sin señal (minutos)"
          value={thresholds.deviceOfflineMinutes}
          onChange={(v) => onChange({ ...thresholds, deviceOfflineMinutes: v })}
          disabled={disabled}
          icon={Printer}
          help={<>Sin una lectura de contadores de un equipo durante este intervalo (con su monitor activo), se marca <span className="text-amber-500 font-bold uppercase tracking-tighter">Sin señal</span>. Debe ser mayor al del monitor: un agente inactivo fuera de horario laboral puede tardar horas en volver a leer.</>}
        />
      </div>
    </div>
  );
}
