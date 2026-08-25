import { useState } from 'react';
import { Loader2, ShieldOff } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import IpRangesEditor from './IpRangesEditor';
import SnmpCredentialsPanel from './SnmpCredentialsPanel';
import type { EditFormData, MonitorData, SnmpCredentialInput } from '../../../shared/types/monitor';
import { DEFAULT_BUSINESS_HOURS } from '../../../shared/types/agents';

interface ConfigTabPanelProps {
  monitor: MonitorData;
  onSave: (form: EditFormData) => Promise<void>;
  onSaveSnmpCredentials: (credentials: SnmpCredentialInput[], expectedRev: number) => Promise<void>;
  /** `REVOCAR` (handoff hifi "Monitor — detalle", 25/08/2026) — se reubica acá
   * desde la barra de acciones del header (deja de ser una acción destructiva de
   * primer nivel). El modal de doble confirmación sigue viviendo en
   * `MonitorDetail.tsx` (mismo `ConfirmModal` de siempre); este panel sólo dispara
   * el pedido de apertura. */
  onRequestRevoke: () => void;
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

const LABEL = 'mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand';

function formFromMonitor(monitor: MonitorData): EditFormData {
  // `MonitorData.config.ip_ranges` es siempre un array ya parseado — la
  // columna `agents.ip_ranges` es `jsonb`, node-pg la devuelve parseada
  // siempre, y el backend (`parseAgentIpRanges` en
  // `portalAgentController/reads.ts`) nunca manda un string crudo.
  const ranges = monitor.config?.ip_ranges?.length ? monitor.config.ip_ranges : [{ start: '', end: '' }];
  return {
    name: monitor.name,
    ip_ranges: ranges,
    snmp: monitor.config?.snmp_community ?? 'public',
    tonerWarningThreshold: monitor.config?.toner_warning_threshold ?? 20,
    tonerCriticalThreshold: monitor.config?.toner_critical_threshold ?? 10,
    businessHours: monitor.config?.business_hours ?? DEFAULT_BUSINESS_HOURS,
  };
}

function validateForm(form: EditFormData, showToast: (msg: string, kind: 'error' | 'warning') => void): boolean {
  if (form.tonerCriticalThreshold >= form.tonerWarningThreshold) {
    showToast('El umbral crítico debe ser menor que el umbral de advertencia', 'error');
    return false;
  }
  for (const r of form.ip_ranges) {
    const invalid = r.hostname !== undefined ? !r.hostname.trim()
      : r.cidr !== undefined ? !r.cidr.trim()
      : (!r.start?.trim() || !r.end?.trim());
    if (invalid) { showToast('Todos los rangos deben tener un CIDR, un hostname, o una IP de inicio y fin', 'warning'); return false; }
  }
  if (form.businessHours.days.length === 0) { showToast('El horario laboral requiere al menos un día', 'warning'); return false; }
  if (form.businessHours.start_hour >= form.businessHours.end_hour) {
    showToast('La hora de inicio del horario laboral debe ser menor que la de fin', 'warning');
    return false;
  }
  return true;
}

export default function ConfigTabPanel({ monitor, onSave, onSaveSnmpCredentials, onRequestRevoke }: ConfigTabPanelProps) {
  const [form, setForm] = useState<EditFormData>(() => formFromMonitor(monitor));
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const set = (key: keyof EditFormData, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(form, showToast)) return;
    setSaving(true);
    try { await onSave(form); } catch (err: unknown) { showToast((err as Error).message || 'Error al actualizar configuración', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[5px] border border-line-100 bg-white p-5">
          <div className="mb-4 border-b border-line-150 pb-3.5">
            <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Parámetros de red</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className={LABEL}>Nombre del sitio</label>
              <input required type="text" value={form.name} className={INPUT} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Segmentos IP barridos</label>
              <div className="max-h-[300px] overflow-y-auto pr-1">
                <IpRangesEditor ranges={form.ip_ranges} onChange={ranges => setForm(f => ({ ...f, ip_ranges: ranges }))} credentials={monitor.config?.snmp_credentials ?? []} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Comunidad SNMP</label>
              <input type="text" value={form.snmp} className={`${INPUT} font-mono`} onChange={e => set('snmp', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-[5px] border border-line-100 bg-white p-5">
          <div className="mb-4 border-b border-line-150 pb-3.5">
            <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Umbrales de consumibles</span>
          </div>
          <div className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Advertencia (naranja)</label>
                <span className="font-montserrat text-[12.5px] font-semibold tabular-nums text-brand-accent">{form.tonerWarningThreshold}%</span>
              </div>
              <input type="range" min="1" max="99" value={form.tonerWarningThreshold} onChange={e => set('tonerWarningThreshold', parseInt(e.target.value))} className="h-1.5 w-full cursor-pointer appearance-none rounded-[3px] bg-surface-track accent-brand" />
              <p className="mt-1.5 font-sans text-[11.5px] leading-[1.5] text-ink-300">Se crea una alerta cuando algún color de tóner baja de este porcentaje.</p>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Crítico (naranja oscuro)</label>
                <span className="font-montserrat text-[12.5px] font-semibold tabular-nums text-brand-severe">{form.tonerCriticalThreshold}%</span>
              </div>
              <input type="range" min="1" max="99" value={form.tonerCriticalThreshold} onChange={e => set('tonerCriticalThreshold', parseInt(e.target.value))} className="h-1.5 w-full cursor-pointer appearance-none rounded-[3px] bg-surface-track accent-brand-severe" />
              <p className="mt-1.5 font-sans text-[11.5px] leading-[1.5] text-ink-300">Se crea una alerta crítica cuando el tóner baja de este porcentaje.</p>
            </div>
            <p className="border-t border-line-150 pt-3.5 font-sans text-[11.5px] leading-[1.5] text-ink-300">
              Cada color de tóner se evalúa de forma independiente; las alertas se resuelven solas apenas el nivel sube (p. ej. tras un cambio de cartucho).
            </p>
          </div>
        </div>

        <div className="rounded-[5px] border border-line-100 bg-white p-5 lg:col-span-2">
          <div className="mb-4 border-b border-line-150 pb-3.5">
            <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Horario laboral</span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className={LABEL}>Zona horaria (IANA)</label>
              <input type="text" list="tz-datalist" value={form.businessHours.timezone} onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, timezone: e.target.value } }))} className={`${INPUT} font-mono`} />
              <datalist id="tz-datalist">{COMMON_TIMEZONES.map(tz => <option key={tz} value={tz} />)}</datalist>
            </div>
            <div>
              <label className={LABEL}>Horario (hora local)</label>
              <div className="flex items-center gap-2.5">
                <input type="number" min={0} max={23} value={form.businessHours.start_hour} onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, start_hour: parseInt(e.target.value, 10) || 0 } }))} className={`${INPUT} font-mono`} />
                <span className="text-ink-200">—</span>
                <input type="number" min={1} max={24} value={form.businessHours.end_hour} onChange={e => setForm(f => ({ ...f, businessHours: { ...f.businessHours, end_hour: parseInt(e.target.value, 10) || 1 } }))} className={`${INPUT} font-mono`} />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className={LABEL}>Días laborables</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map(({ iso, label }) => {
                const active = form.businessHours.days.includes(iso);
                return (
                  <button
                    key={iso} type="button"
                    onClick={() => setForm(f => ({ ...f, businessHours: { ...f.businessHours, days: active ? f.businessHours.days.filter(d => d !== iso) : [...f.businessHours.days, iso].sort((a, b) => a - b) } }))}
                    className={`rounded-[3px] px-3.5 py-2 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.06em] transition-colors duration-150 ease-in-out ${active ? 'bg-brand text-white' : 'border border-line-300 bg-white text-ink-300 hover:bg-surface-btn-hover'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <SnmpCredentialsPanel credentials={monitor.config?.snmp_credentials ?? []} rev={monitor.config?.snmp_credentials_rev ?? 0} onSave={onSaveSnmpCredentials} />

        {/* Zona de riesgo (handoff §5 punto 21) — border-left naranja oscuro, REVOCAR en variante borde, nunca rojo relleno. */}
        <div className="space-y-3.5 rounded-[5px] border border-brand-chip-border bg-white p-5 lg:col-span-2" style={{ borderLeftWidth: 3, borderLeftColor: '#C6710A' }}>
          <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Zona de riesgo</span>
          <p className="max-w-2xl font-sans text-[12.5px] leading-[1.55] text-ink-700">
            Revocar desconecta el agente de forma permanente: deja de reportar telemetría y su llave de activación queda inválida.
            Los equipos que monitoreaba dejan de recibir lecturas nuevas hasta vincularlos a otro monitor.
          </p>
          <button
            type="button" onClick={onRequestRevoke}
            className="flex items-center gap-2.5 rounded-[3px] border border-brand-chip-border bg-white px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-brand-severe transition-colors duration-150 ease-in-out hover:bg-brand-soft"
          >
            <ShieldOff size={14} /> Revocar licencia
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => setForm(formFromMonitor(monitor))} className="rounded-[3px] border border-line-300 bg-white px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
          Descartar
        </button>
        <button
          type="submit" disabled={saving}
          className="flex items-center gap-2.5 rounded-[3px] bg-brand px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Guardar cambios
        </button>
      </div>
    </form>
  );
}
