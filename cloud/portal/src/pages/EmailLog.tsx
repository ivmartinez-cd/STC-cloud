import { useState, useEffect, useCallback } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { api } from '../lib/api';

interface EmailLogRow {
  id: string;
  client_id: string | null;
  event: string;
  recipient: string | null;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
}

interface ClientOption { id: string; name: string; }

const STATUS_LABELS: Record<string, string> = {
  sent: 'Enviado',
  error: 'Error',
  skipped_no_transport: 'Sin SMTP',
  skipped_no_recipient: 'Sin destinatario',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-emerald-50 text-emerald-600',
  error: 'bg-rose-50 text-rose-600',
  skipped_no_transport: 'bg-amber-50 text-amber-600',
  skipped_no_recipient: 'bg-slate-100 text-slate-500',
};

const EVENT_LABELS: Record<string, string> = {
  'alert.created': 'Alerta',
  'incident.created': 'Incidente',
  'supply_request.created': 'Pedido nuevo',
  'supply_request.completed': 'Pedido completado',
  'report.closed': 'Cierre mensual',
  scheduled_report: 'Informe programado',
};

function fmtDate(v: string): string {
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const selectCls = 'bg-white text-slate-700 text-sm font-bold px-4 py-2.5 rounded-2xl border border-slate-200 outline-none focus:border-brand cursor-pointer';

/**
 * Registro de auditoría de correo (Fase 4.4 del gap analysis vs HP SDS).
 * Cada intento de envío queda acá, incluso los que no salieron.
 */
export default function EmailLog() {
  const [items, setItems] = useState<EmailLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (clientFilter) params.set('client_id', clientFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '100');
    api.get<{ items: EmailLogRow[]; total: number }>(`/email-log?${params}`)
      .then((d) => { setItems(d.items); setTotal(d.total); })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [clientFilter, statusFilter, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, []);

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? '…' : '—');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
          <MailCheck size={28} className="text-brand" /> Correo
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Auditoría de emails de notificación — cada intento queda registrado, se haya enviado o no.
        </p>
      </header>

      <div className="flex gap-3 flex-wrap">
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={selectCls}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">Todo estado</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar destinatario o asunto…"
          className="flex-1 min-w-[220px] bg-white text-slate-700 text-sm font-medium px-4 py-2.5 rounded-2xl border border-slate-200 outline-none focus:border-brand" />
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={28} className="text-brand animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-sm text-slate-400 font-medium">
          Sin registros de correo con estos filtros.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Fecha', 'Cliente', 'Evento', 'Destinatario', 'Asunto', 'Estado'].map((h) => (
                  <th key={h} className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50" title={r.error ?? undefined}>
                  <td className="py-3 px-4 text-slate-500 font-medium whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{clientName(r.client_id)}</td>
                  <td className="py-3 px-4 text-slate-500 font-bold text-[10px] uppercase">{EVENT_LABELS[r.event] ?? r.event}</td>
                  <td className="py-3 px-4 text-slate-600 font-medium">{r.recipient ?? '—'}</td>
                  <td className="py-3 px-4 text-slate-600 font-medium max-w-[320px] truncate" title={r.subject}>{r.subject}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > items.length && (
            <p className="p-3 text-[10px] text-slate-400 font-bold text-center">Mostrando {items.length} de {total}</p>
          )}
        </div>
      )}
    </div>
  );
}
