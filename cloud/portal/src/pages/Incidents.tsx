import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, ChevronLeft, ChevronRight, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Incident, IncidentListResponse } from '../types/incidents';
import type { AlertClassOption } from '../types/alerts';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS, type IncidentStatus } from '../lib/constants';
import CreateIncidentModal from '../components/incidents/CreateIncidentModal';

interface ClientOption { id: string; name: string; }

const PAGE_SIZE = 50;

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtAging(seconds: number | string): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const Incidents = () => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const canManage = role === 'admin' || role === 'operator';

  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [classOptions, setClassOptions] = useState<AlertClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<string>('');
  const [klass, setKlass] = useState('');

  const fetchClients = useCallback(async () => {
    if (!canManage) return;
    try { setClients(await api.get<ClientOption[]>('/clients')); } catch { /* comodidad */ }
  }, [canManage]);

  const fetchClasses = useCallback(async () => {
    try {
      const data = await api.get<{ classes: AlertClassOption[] }>('/alerts/classes');
      setClassOptions(data.classes);
    } catch { /* comodidad */ }
  }, []);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (clientId) params.set('client_id', clientId);
    if (status) params.set('status', status);
    if (klass) params.set('class', klass);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    try {
      const data = await api.get<IncidentListResponse>(`/incidents?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId, status, klass, page]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchClasses(); }, [fetchClasses]);
  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);
  useEffect(() => { setPage(0); }, [clientId, status, klass]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
            <AlertOctagon size={28} className="text-brand" /> Incidentes
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Unidades de trabajo de servicio — sobreviven a que la alerta técnica que las originó se resuelva sola.
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-5 py-3 bg-[#1a2333] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-brand-hover transition-all active:scale-95 shadow-xl shadow-brand/10">
            <Plus size={16} /> Nuevo Incidente
          </button>
        )}
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        {canManage && (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Todo estado</option>
          {(Object.keys(INCIDENT_STATUS_LABELS) as IncidentStatus[]).map((s) => (
            <option key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={klass} onChange={(e) => setKlass(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Toda clase</option>
          {classOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-auto">{total} resultado(s)</span>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{error}</div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center animate-pulse">
          <Loader2 size={32} className="text-brand animate-spin mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando incidentes...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
          <ShieldCheck size={48} className="mb-3 text-emerald-500" />
          <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Sin incidentes</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Ningún resultado con los filtros actuales</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Equipo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Título</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Clase</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Origen</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Antigüedad</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Apertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((inc) => (
                <tr key={inc.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => navigate(`/incidents/${inc.id}`)}>
                  <td className="py-2.5 px-4 text-[11px] font-mono text-slate-500">#{inc.number}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-700 font-bold">{inc.client_name || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{inc.device_label || inc.device_serial || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600 max-w-[280px] truncate" title={inc.title}>{inc.title}</td>
                  <td className="py-2.5 px-4">
                    <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                      {classOptions.find((c) => (c.id as string) === inc.class)?.label ?? inc.class}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[10px] font-bold text-slate-400 uppercase">{inc.origin === 'auto' ? 'Automático' : 'Manual'}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${INCIDENT_STATUS_COLORS[inc.status]}`}>
                      {INCIDENT_STATUS_LABELS[inc.status]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] font-bold text-slate-700">{fmtAging(inc.aging_seconds)}</td>
                  <td className="py-2.5 px-4 text-[10px] text-slate-500 font-medium">{fmtDate(inc.opened_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Página {page + 1} de {totalPages}</span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <CreateIncidentModal
        isOpen={showCreate} onClose={() => setShowCreate(false)}
        onCreated={(id) => navigate(`/incidents/${id}`)}
        clients={clients}
      />
    </div>
  );
};

export default Incidents;
