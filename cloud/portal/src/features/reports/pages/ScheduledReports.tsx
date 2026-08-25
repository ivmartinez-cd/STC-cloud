import { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock, Download, Loader2, Pencil, Play, Plus, Trash2,
} from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ScheduledReportModal from '../components/ScheduledReportModal';
import {
  FREQ_LABELS, REPORT_TYPE_LABELS, type ScheduledReport,
} from '../types/scheduledReports';

interface ClientOption { id: string; name: string; }

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Informes guardados/programados (Fase 4.1 del gap analysis vs HP SDS —
 * equivalente de "Informes configurados" del SDS). Solo admin/operator
 * (ruta protegida en App.tsx + deny-by-default del backend).
 */
export default function ScheduledReports() {
  const { showToast } = useToast();
  const [items, setItems] = useState<ScheduledReport[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<ScheduledReport[]>('/scheduled-reports')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get<ClientOption[]>('/clients').then((c) => setClients(c)).catch(() => setClients([]));
  }, [load]);

  const runNow = async (r: ScheduledReport) => {
    setBusyId(r.id);
    try {
      const res = await api.post<{ status: string; sent_to: string[] }>(`/scheduled-reports/${r.id}/run`);
      showToast(res.sent_to.length ? `Informe enviado a ${res.sent_to.join(', ')}` : 'Informe generado (sin destinatarios)', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al ejecutar', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: ScheduledReport) => {
    if (!window.confirm(`¿Eliminar el informe "${r.name}"?`)) return;
    try {
      await api.delete(`/scheduled-reports/${r.id}`);
      showToast('Informe eliminado', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', 'error');
    }
  };

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? '…' : 'Todos');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
            <CalendarClock size={28} className="text-brand" /> Informes
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Informes guardados y programados — se generan solos y llegan por email.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-5 py-3 bg-[#1a2333] hover:bg-black text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all">
          <Plus size={15} /> Nuevo informe
        </button>
      </header>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={28} className="text-brand animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-sm text-slate-400 font-medium">
          Sin informes todavía. Creá el primero con "Nuevo informe".
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Nombre', 'Tipo', 'Cliente', 'Frecuencia', 'Próxima corrida', 'Última corrida', 'Destinatarios', ''].map((h) => (
                  <th key={h} className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-bold text-slate-700">{r.name}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{REPORT_TYPE_LABELS[r.report_type]}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{clientName(r.client_id)}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                      r.schedule_freq === 'none' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'
                    }`}>{FREQ_LABELS[r.schedule_freq]}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{fmtDate(r.next_run_at)}</td>
                  <td className="py-3 px-4">
                    {r.last_run_at ? (
                      <span className={`font-bold ${r.last_run_status === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}
                        title={r.last_run_error ?? undefined}>
                        {fmtDate(r.last_run_at)} {r.last_run_status === 'ok' ? '✓' : '✗'}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-medium max-w-[180px] truncate" title={r.recipients.join(', ')}>
                    {r.recipients.length || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <a href={`/api/v1/scheduled-reports/${r.id}/download`} target="_blank" rel="noreferrer" title="Descargar ahora"
                        className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all">
                        <Download size={13} />
                      </a>
                      <button onClick={() => runNow(r)} disabled={busyId === r.id} title="Ejecutar y enviar ahora"
                        className="p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all disabled:opacity-50">
                        {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      </button>
                      <button onClick={() => { setEditing(r); setModalOpen(true); }} title="Editar"
                        className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(r)} title="Eliminar"
                        className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ScheduledReportModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={load}
        clients={clients} editing={editing} />
    </div>
  );
}
