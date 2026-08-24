import { useEffect, useState } from 'react';
import { BrandModal } from '../ui/BrandModal';
import { api } from '../../lib/api';
import {
  DOW_LABELS, FREQ_LABELS, REPORT_TYPE_LABELS,
  type ScheduledReport, type ScheduledReportType, type ScheduleFreq,
} from '../../types/scheduledReports';

interface ClientOption { id: string; name: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  clients: ClientOption[];
  /** null = alta; con valor = edición. */
  editing: ScheduledReport | null;
}

const inputCls = 'w-full bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand';
const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1';

/**
 * Alta/edición de informes guardados/programados (Fase 4.1 del gap analysis
 * vs HP SDS). El backend recalcula `next_run_at` en cada guardado, así que
 * este form solo junta la definición y la manda entera (PUT reemplaza todo).
 */
export default function ScheduledReportModal({ isOpen, onClose, onSaved, clients, editing }: Props) {
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
    setError(null);
    setName(editing?.name ?? '');
    setReportType(editing?.report_type ?? 'asset_list');
    setClientId(editing?.client_id ?? '');
    setFormat(editing?.format ?? 'xlsx');
    setFreq(editing?.schedule_freq ?? 'none');
    setDow(editing?.schedule_dow ?? 1);
    setDom(editing?.schedule_dom ?? 1);
    setHour(editing?.schedule_hour ?? 8);
    setRecipientsText((editing?.recipients ?? []).join(', '));
    setParamsText(editing && Object.keys(editing.params).length ? JSON.stringify(editing.params) : '');
  }, [isOpen, editing]);

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
              <p className="text-[10px] text-amber-600 font-bold mt-1">El informe de uso requiere un cliente.</p>
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
            <p className="text-[10px] text-amber-600 font-bold mt-1">Un informe programado necesita al menos un destinatario.</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Filtros avanzados (JSON, opcional)</label>
          <input className={inputCls} value={paramsText} onChange={(e) => setParamsText(e.target.value)} placeholder='{"offline_days": 3}' />
          <p className="text-[10px] text-slate-400 font-medium mt-1">
            usage: period · non_contactable: offline_days · consumable_levels: max_percentage, max_days · alert_history: days, alert_class
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
          <button onClick={save} disabled={saving || name.trim().length < 3}
            className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </BrandModal>
  );
}
