import { Fragment, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Loader2, ShieldOff } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import SnmpCredentialsPanel from './SnmpCredentialsPanel';
import RemoteEwsPanel from './RemoteEwsPanel';
import { INTERVAL_ROWS, configFormProblem, formFromMonitor } from './configFormHelpers';
import type { EditFormData, MonitorData, SnmpCredentialInput } from '../../../shared/types/monitor';
import type { MonitorIntervalsConfig } from '../../../shared/types/agents';
import { fmt } from '../../../shared/lib/formatters';
import { summaryText } from '../lib/rangeSpecText';

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
  /** Los segmentos IP se editan en su propio tab (`SegmentsTabPanel`): acá
   *  sólo se resumen y se linkea. */
  onOpenSegments: () => void;
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

export default function ConfigTabPanel({ monitor, onSave, onSaveSnmpCredentials, onRequestRevoke, onOpenSegments }: ConfigTabPanelProps) {
  const [form, setForm] = useState<EditFormData>(() => formFromMonitor(monitor));
  const [saving, setSaving] = useState(false);
  // Colapsado por default: son 8 números que casi nadie toca (el operador
  // típico deja los valores de HP SDS) — mostrarlos siempre habría forzado
  // scroll en 1920x900 (ver Portal viewport-fit pattern) en una columna que
  // ya tiene Umbrales + Horario laboral.
  const [showIntervals, setShowIntervals] = useState(false);
  const { showToast } = useToast();

  const set = (key: keyof EditFormData, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));
  // Nombre explícito para no sombrear el `setInterval` global (no es un timer).
  const setLoopInterval = (loop: keyof MonitorIntervalsConfig, field: 'biz' | 'off', value: number) =>
    setForm(prev => ({ ...prev, monitorIntervals: { ...prev.monitorIntervals, [loop]: { ...prev.monitorIntervals[loop], [field]: value } } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = configFormProblem(form);
    if (problem) { showToast(...problem); return; }
    setSaving(true);
    try { await onSave(form); } catch (err: unknown) { showToast((err as Error).message || 'Error al actualizar configuración', 'error'); }
    finally { setSaving(false); }
  };

  // 3 columnas que llenan el alto (rediseño sin scroll, 27/08/2026): red +
  // umbrales | horario + frecuencia | credenciales SNMP + zona de riesgo. Los
  // segmentos IP (lo único que crece con el cliente) viven en su propio tab
  // desde el 11/09/2026 — acá queda el resumen y el link.
  const ranges = monitor.config?.ip_ranges ?? [];
  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-4">
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
              <label className={LABEL}>Comunidad SNMP</label>
              <input type="text" value={form.snmp} className={`${INPUT} font-mono`} onChange={e => set('snmp', e.target.value)} />
              <p className="mt-1.5 font-sans text-[11.5px] leading-[1.5] text-ink-300 short:hidden">Comunidad v1/v2c por defecto; las credenciales adicionales se cargan a la derecha.</p>
            </div>
            <div className="rounded-[3px] border border-line-150 bg-surface-input px-3.5 py-3">
              <label className={LABEL}>Segmentos IP barridos</label>
              <p className="font-sans text-[12px] text-ink-700">{summaryText(ranges, fmt)}</p>
              <button type="button" onClick={onOpenSegments} className="mt-2 flex items-center gap-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand transition-colors duration-150 ease-in-out hover:text-brand-severe">
                Editar segmentos <ArrowRight size={13} />
              </button>
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
            <p className="border-t border-line-150 pt-3.5 font-sans text-[11.5px] leading-[1.5] text-ink-300 short:hidden">
              Cada color de tóner se evalúa de forma independiente; las alertas se resuelven solas apenas el nivel sube (p. ej. tras un cambio de cartucho).
            </p>
          </div>
        </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
        <div className="rounded-[5px] border border-line-100 bg-white p-5">
          <div className="mb-4 border-b border-line-150 pb-3.5">
            <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Horario laboral</span>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map(({ iso, label }) => {
                const active = form.businessHours.days.includes(iso);
                return (
                  <button
                    key={iso} type="button"
                    onClick={() => setForm(f => ({ ...f, businessHours: { ...f.businessHours, days: active ? f.businessHours.days.filter(d => d !== iso) : [...f.businessHours.days, iso].sort((a, b) => a - b) } }))}
                    className={`rounded-[3px] px-3 py-2 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.04em] transition-colors duration-150 ease-in-out ${active ? 'bg-brand text-white' : 'border border-line-300 bg-white text-ink-300 hover:bg-surface-btn-hover'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[5px] border border-line-100 bg-white p-5 short:p-4">
          <button
            type="button" onClick={() => setShowIntervals(s => !s)}
            className="flex w-full items-center justify-between border-b border-line-150 pb-3.5 text-left"
          >
            <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Frecuencia de monitoreo</span>
            {showIntervals ? <ChevronUp size={14} className="text-ink-300" /> : <ChevronDown size={14} className="text-ink-300" />}
          </button>
          {showIntervals && (
            <div className="mt-4 space-y-3">
              <p className="font-sans text-[11.5px] leading-[1.5] text-ink-300 short:hidden">
                Cada cuánto el agente consulta cada tipo de dato, en minutos. &quot;Fuera de horario&quot; no puede ser más rápido que &quot;horario laboral&quot;.
              </p>
              <div className="grid grid-cols-[1fr_64px_64px] items-center gap-x-2.5 gap-y-2">
                <span />
                <span className={`${LABEL} mb-0 text-center`}>Laboral</span>
                <span className={`${LABEL} mb-0 text-center`}>Fuera</span>
                {INTERVAL_ROWS.map(({ key, label }) => (
                  <Fragment key={key}>
                    <span className="font-sans text-[12px] text-ink-700">{label}</span>
                    <input
                      type="number" min={1} max={1440} value={form.monitorIntervals[key].biz}
                      onChange={e => setLoopInterval(key, 'biz', parseInt(e.target.value, 10) || 1)}
                      className={`${INPUT} px-2 py-1.5 text-center font-mono text-[12px]`}
                    />
                    <input
                      type="number" min={1} max={1440} value={form.monitorIntervals[key].off}
                      onChange={e => setLoopInterval(key, 'off', parseInt(e.target.value, 10) || 1)}
                      className={`${INPUT} px-2 py-1.5 text-center font-mono text-[12px]`}
                    />
                  </Fragment>
                ))}
              </div>
              <p className="font-sans text-[10.5px] leading-[1.4] text-ink-300 short:hidden">
                Default (HP SDS): alertas 3/15 · contadores 20/240 · consumibles y bandejas 60/240 · identidad 10/60.
              </p>
            </div>
          )}
        </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
        <SnmpCredentialsPanel credentials={monitor.config?.snmp_credentials ?? []} rev={monitor.config?.snmp_credentials_rev ?? 0} onSave={onSaveSnmpCredentials} />

        <RemoteEwsPanel agentId={monitor.id} initialEnabled={monitor.remote_ews_enabled ?? false} />

        {/* Zona de riesgo (handoff §5 punto 21) — border-left naranja oscuro, REVOCAR en variante borde, nunca rojo relleno. */}
        <div className="space-y-3.5 short:space-y-2 rounded-[5px] border border-brand-chip-border bg-white p-5 short:p-4" style={{ borderLeftWidth: 3, borderLeftColor: '#C6710A' }}>
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
