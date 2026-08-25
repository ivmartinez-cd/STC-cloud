import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Loader2, MailOpen, RotateCcw, Save } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';

interface TemplateRow {
  event: string;
  placeholders: string[];
  source: 'default' | 'global' | 'client';
  id: string | null;
  subject: string;
  body: string;
  default_subject: string;
  default_body: string;
}

const EVENT_LABELS: Record<string, string> = {
  'alert.created': 'Alerta crítica',
  'incident.created': 'Incidente abierto',
  'supply_request.created': 'Pedido de consumible nuevo',
  'supply_request.completed': 'Pedido de consumible completado',
  'report.closed': 'Cierre mensual',
};

const inputCls = 'w-full bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand';

/**
 * Plantillas de mensajes globales (Fase 4.3 del gap analysis vs HP SDS —
 * equivalente de "Plantillas de mensajes" del SDS). Los placeholders
 * `{{var}}` se reemplazan al enviar; sin plantilla guardada se usa el texto
 * default del sistema.
 */
export default function MessageTemplatesCard() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<TemplateRow[]>('/message-templates')
      .then((data) => {
        setRows(data);
        setDrafts(Object.fromEntries(data.map((t) => [t.event, { subject: t.subject, body: t.body }])));
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (row: TemplateRow) => {
    setBusy(row.event);
    try {
      await api.put('/message-templates', { event: row.event, ...drafts[row.event] });
      showToast(`Plantilla "${EVENT_LABELS[row.event]}" guardada`, 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (row: TemplateRow) => {
    if (row.source !== 'global' || !row.id) return;
    setBusy(row.event);
    try {
      await api.delete(`/message-templates/${row.id}`);
      showToast('Plantilla restaurada al default del sistema', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-8">
      <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3 mb-2">
        <div className="p-2 bg-brand/10 text-brand rounded-xl"><MailOpen size={18} /></div>
        Plantillas de Mensajes
      </h3>
      <p className="text-xs text-slate-500 font-medium mb-5">
        Texto de los emails de notificación. Los <code className="font-mono">{'{{placeholders}}'}</code> se reemplazan al enviar; sin plantilla guardada se usa el texto default.
      </p>
      <div className="divide-y divide-slate-50">
        {rows.map((row) => (
          <div key={row.event} className="py-3">
            <button onClick={() => setOpen(open === row.event ? null : row.event)}
              className="w-full flex items-center justify-between text-left">
              <span className="text-xs font-bold text-slate-700">
                {EVENT_LABELS[row.event] ?? row.event}
                <span className={`ml-2 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                  row.source === 'default' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'
                }`}>{row.source === 'default' ? 'Default' : 'Personalizada'}</span>
              </span>
              {open === row.event ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
            </button>
            {open === row.event && drafts[row.event] && (
              <div className="mt-3 space-y-3">
                <input className={inputCls} value={drafts[row.event].subject}
                  onChange={(e) => setDrafts({ ...drafts, [row.event]: { ...drafts[row.event], subject: e.target.value } })} />
                <textarea className={`${inputCls} h-28 font-mono text-xs`} value={drafts[row.event].body}
                  onChange={(e) => setDrafts({ ...drafts, [row.event]: { ...drafts[row.event], body: e.target.value } })} />
                <p className="text-[10px] text-slate-400 font-bold">
                  Placeholders: {row.placeholders.map((ph) => `{{${ph}}}`).join(' · ')}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => save(row)} disabled={busy === row.event}
                    className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                    {busy === row.event ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                  </button>
                  {row.source === 'global' && (
                    <button onClick={() => restore(row)} disabled={busy === row.event}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                      <RotateCcw size={12} /> Restaurar default
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
