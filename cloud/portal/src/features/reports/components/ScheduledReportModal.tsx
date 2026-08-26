import { useEffect, useState } from 'react';
import { BrandModal } from '../../../shared/components/BrandModal';
import { api } from '../../../shared/lib/api';
import {
  DOW_LABELS, FREQ_LABELS, REPORT_TYPE_LABELS,
  type ScheduledReport, type ScheduledReportType, type ScheduleFreq, type ReportTemplate,
} from '../types/scheduledReports';

interface ClientOption { id: string; name: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  clients: ClientOption[];
  /** null = alta; con valor = edición. */
  editing: ScheduledReport | null;
  /** "USAR PLANTILLA" (handoff hifi #3, fase 5) — precarga tipo/formato/frecuencia/params sugeridos; el usuario los sigue pudiendo editar. Ignorado si `editing` viene con valor. */
  initialTemplate?: ReportTemplate | null;
}

const inputCls = 'w-full rounded-[3px] border border-line-100 bg-surface-input px-3 py-2 font-sans text-[13px] text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-brand';
const labelCls = 'mb-1 block font-montserrat text-[9.5px] font-bold uppercase tracking-[.1em] text-ink-300';

/**
 * Alta/edición de informes guardados/programados (Fase 4.1 del gap analysis
 * vs HP SDS). El backend recalcula `next_run_at` en cada guardado, así que
 * este form solo junta la definición y la manda entera (PUT reemplaza todo).
 */
export default function ScheduledReportModal({ isOpen, onClose, onSaved, clients, editing, initialTemplate }: Props) {
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState<ScheduledReportType>('asset_list');
  const [clientId, setClientId] = useState('');
  const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [freq, setFreq] = useState<ScheduleFreq>('none');
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const [hour, setHour] = useState(8);
  const [recipientsText, setRecipientsText] = useState('');
  const [paramsText, setParamsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const t = !editing ? initialTemplate : null;
    setError(null);
    setName(editing?.name ?? (t ? t.label : ''));
    setReportType(editing?.report_type ?? t?.report_type ?? 'asset_list');
    setClientId(editing?.client_id ?? '');
    setFormat(editing?.format ?? t?.default_format ?? 'xlsx');
    setFreq(editing?.schedule_freq ?? t?.suggested_frequency ?? 'none');
    setDow(editing?.schedule_dow ?? 1);
    setDom(editing?.schedule_dom ?? 1);
    setHour(editing?.schedule_hour ?? 8);
    setRecipientsText((editing?.recipients ?? []).join(', '));
    const params = editing?.params ?? t?.default_params;
    setParamsText(params && Object.keys(params).length ? JSON.stringify(params) : '');
  }, [isOpen, editing, initialTemplate]);

  const save = async () => {
    setSaving(true);
    setError(null);
    let params: Record<string, unknown> = {};
    try {
      if (paramsText.trim()) params = JSON.parse(paramsText);
    } catch {
      setError('Filtros: JSON inválido'); setSaving(false); return;
    }
    const body = {
      name, report_type: reportType, client_id: clientId || null, format, params,
      schedule_freq: freq, schedule_dow: freq === 'weekly' ? dow : null,
      schedule_dom: freq === 'monthly' ? dom : null, schedule_hour: hour,
      recipients: recipientsText.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editing) await api.put(`/scheduled-reports/${editing.id}`, body);
      else await api.post('/scheduled-reports', body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BrandModal isOpen={isOpen} onClose={onClose} title={editing ? 'Editar informe' : 'Nuevo informe'} widthPx={560} error={error}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Nombre</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Contadores mensuales Acme" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tipo de informe</label>
            <select className={inputCls} value={reportType} onChange={(e) => setReportType(e.target.value as ScheduledReportType)}>
              {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cliente</label>
            <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {reportType === 'usage' && !clientId && (
              <p className="font-sans text-[10.5px] font-semibold text-brand-accent mt-1">El informe de uso requiere un cliente.</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Formato</label>
            <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')}>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Frecuencia</label>
            <select className={inputCls} value={freq} onChange={(e) => setFreq(e.target.value as ScheduleFreq)}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Hora</label>
            <select className={inputCls} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </div>
        {freq === 'weekly' && (
          <div>
            <label className={labelCls}>Día de la semana</label>
            <select className={inputCls} value={dow} onChange={(e) => setDow(Number(e.target.value))}>
              {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        {freq === 'monthly' && (
          <div>
            <label className={labelCls}>Día del mes (1–28)</label>
            <input type="number" min={1} max={28} className={inputCls} value={dom} onChange={(e) => setDom(Number(e.target.value))} />
          </div>
        )}
        <div>
          <label className={labelCls}>Destinatarios (emails separados por coma)</label>
          <input className={inputCls} value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} placeholder="reportes@empresa.com, gerencia@empresa.com" />
          {freq !== 'none' && !recipientsText.trim() && (
            <p className="font-sans text-[10.5px] font-semibold text-brand-accent mt-1">Un informe programado necesita al menos un destinatario.</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Filtros avanzados (JSON, opcional)</label>
          <input className={inputCls} value={paramsText} onChange={(e) => setParamsText(e.target.value)} placeholder='{"offline_days": 3}' />
          <p className="font-sans text-[10.5px] text-ink-300 mt-1">
            usage: period · non_contactable: offline_days · consumable_levels: max_percentage, max_days · alert_history: days, alert_class
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-[3px] px-4 py-2 font-montserrat text-[11px] font-semibold text-ink-600 hover:bg-surface-btn-hover">Cancelar</button>
          <button onClick={save} disabled={saving || name.trim().length < 3}
            className="rounded-[3px] bg-brand px-5 py-2 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white hover:bg-brand-severe disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
