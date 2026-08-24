import { useState } from 'react';
import { Settings, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import IpRangesEditor from './IpRangesEditor';
import SnmpCredentialsPanel from './SnmpCredentialsPanel';
import type { EditFormData, MonitorData, SnmpCredentialInput } from '../../types/monitor';
import { DEFAULT_BUSINESS_HOURS } from '../../types/agents';

interface ConfigTabPanelProps {
  monitor: MonitorData;
  onSave: (form: EditFormData) => Promise<void>;
  onSaveSnmpCredentials: (credentials: SnmpCredentialInput[], expectedRev: number) => Promise<void>;
}

/** ISO weekday: 1=lunes..7=domingo — mismo convenio que `businessHours.days`. */
const WEEKDAY_LABELS = [
  { iso: 1, label: 'Lun' }, { iso: 2, label: 'Mar' }, { iso: 3, label: 'Mié' },
  { iso: 4, label: 'Jue' }, { iso: 5, label: 'Vie' }, { iso: 6, label: 'Sáb' }, { iso: 7, label: 'Dom' },
];

/** Sugerencias del `<datalist>` — el input acepta cualquier TZ IANA como texto libre. */
const COMMON_TIMEZONES = [
  'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Sao_Paulo', 'America/Bogota',
  'America/Lima', 'America/Mexico_City', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Toronto', 'Europe/Madrid', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Lisbon', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];

export default function ConfigTabPanel({ monitor, onSave, onSaveSnmpCredentials }: ConfigTabPanelProps) {
  const [form, setForm] = useState<EditFormData>(() => {
    let ranges = [];
    if (monitor.config?.ip_ranges) {
      ranges = typeof monitor.config.ip_ranges === 'string'
        ? JSON.parse(monitor.config.ip_ranges as unknown as string)
        : monitor.config.ip_ranges;
    }
    if (!Array.isArray(ranges) || ranges.length === 0) {
      ranges = [{ start: '', end: '' }];
    }

    return {
      name: monitor.name,
      ip_ranges: ranges,
      snmp: monitor.config?.snmp_community ?? 'public',
      tonerWarningThreshold: monitor.config?.toner_warning_threshold ?? 20,
      tonerCriticalThreshold: monitor.config?.toner_critical_threshold ?? 10,
      businessHours: monitor.config?.business_hours ?? DEFAULT_BUSINESS_HOURS,
    };
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const set = (key: keyof EditFormData, value: string | number) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.tonerCriticalThreshold >= form.tonerWarningThreshold) {
      showToast('El umbral crítico debe ser menor que el umbral de advertencia', 'error');
      return;
    }

    // Validación de forma en el cliente (mejor UX inmediata) — el cloud
    // re-valida formato/topes en serio al guardar (`validateIpRangeSpecs`).
    for (const r of form.ip_ranges) {
      const invalid = r.hostname !== undefined ? !r.hostname.trim()
        : r.cidr !== undefined ? !r.cidr.trim()
        : (!r.start?.trim() || !r.end?.trim());
      if (invalid) {
        showToast('Todos los rangos deben tener un CIDR, un hostname, o una IP de inicio y fin', 'warning');
        return;
      }
    }

    if (form.businessHours.days.length === 0) {
      showToast('El horario laboral requiere al menos un día', 'warning');
      return;
    }
    if (form.businessHours.start_hour >= form.businessHours.end_hour) {
      showToast('La hora de inicio del horario laboral debe ser menor que la de fin', 'warning');
      return;
    }

    setSaving(true);
    try {
      await onSave(form);
    } catch (err: unknown) {
      showToast((err as Error).message || 'Error al actualizar configuración', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Panel Izquierdo: Ajustes de Escaneo */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-brand/10 text-brand rounded-2xl">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Parámetros de Red</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Control de escaneo y conectividad</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Nodo</label>
            <input
              required type="text" value={form.name}
              className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
              onChange={e => set('name', e.target.value)}
            />
          </div>

          {/* IP Ranges Multi-List */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Segmentos IP Activos</label>
            <div className="max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
              <IpRangesEditor ranges={form.ip_ranges} onChange={ranges => setForm(f => ({ ...f, ip_ranges: ranges }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
              <input type="text" value={form.snmp}
                className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                onChange={e => set('snmp', e.target.value)}
              />
            </div>
          </div>

        </div>

        {/* Panel Derecho: Umbrales de Tóner */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Umbrales de Consumibles</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Alertas automáticas de nivel de tóner</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center ml-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Advertencia de Tóner Bajo (Warning)</label>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-black">{form.tonerWarningThreshold}%</span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range" min="1" max="99" value={form.tonerWarningThreshold}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                onChange={e => set('tonerWarningThreshold', parseInt(e.target.value))}
              />
            </div>
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed ml-1">
              Se creará una alerta amarilla cuando algún color de tóner sea menor o igual a este porcentaje.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center ml-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nivel Crítico de Tóner (Critical)</label>
              <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-black">{form.tonerCriticalThreshold}%</span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range" min="1" max="99" value={form.tonerCriticalThreshold}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
                onChange={e => set('tonerCriticalThreshold', parseInt(e.target.value))}
              />
            </div>
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed ml-1">
              Se creará una alerta roja y crítica cuando el nivel de tóner sea menor o igual a este porcentaje.
            </p>
          </div>

          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Comportamiento del Sensor</p>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                El sistema evalúa cada color de tóner de forma independiente. Las alertas se resuelven automáticamente de inmediato en cuanto los niveles suben (por ejemplo, después de un cambio de cartucho).
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-6 lg:col-span-2">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Clock size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Horario Laboral</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Define la frecuencia de escaneo según día/hora y zona horaria del sitio</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Zona horaria (IANA)</label>
              <input
                type="text" list="tz-datalist" value={form.businessHours.timezone}
                onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, timezone: e.target.value } }))}
                className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono !text-xs"
              />
              <datalist id="tz-datalist">
                {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz} />)}
              </datalist>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Horario (hora local)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={0} max={23} value={form.businessHours.start_hour}
                  onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, start_hour: parseInt(e.target.value, 10) || 0 } }))}
                  className="cd-input w-full !h-12 !text-xs font-mono !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                />
                <span className="text-slate-300 font-black">—</span>
                <input
                  type="number" min={1} max={24} value={form.businessHours.end_hour}
                  onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, end_hour: parseInt(e.target.value, 10) || 1 } }))}
                  className="cd-input w-full !text-xs font-mono !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Días laborables</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map(({ iso, label }) => {
                const active = form.businessHours.days.includes(iso);
                return (
                  <button
                    key={iso} type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      businessHours: {
                        ...f.businessHours,
                        days: active ? f.businessHours.days.filter(d => d !== iso) : [...f.businessHours.days, iso].sort((a, b) => a - b),
                      },
                    }))}
                    className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                      active ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <SnmpCredentialsPanel
          credentials={monitor.config?.snmp_credentials ?? []}
          rev={monitor.config?.snmp_credentials_rev ?? 0}
          onSave={onSaveSnmpCredentials}
        />
      </div>

      {/* Botones de acción */}
      <div className="flex justify-end gap-4">
        <button
          type="submit" disabled={saving}
          className="px-8 py-4 bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-brand/20 flex items-center gap-3 disabled:opacity-50 hover:bg-brand/90 transition-all active:scale-95"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />} Guardar Cambios
        </button>
      </div>
    </form>
  );
}
