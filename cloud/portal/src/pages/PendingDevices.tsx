import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserCheck, Loader2, ChevronLeft, ChevronRight, Search, CheckSquare, Square, Ban, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { PendingDevice, PendingDevicesResponse, PendingDevicesActionResult } from '../types/pendingDevices';

interface ClientOption { id: string; name: string; }

const PAGE_SIZE = 50;

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PendingDevices = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<PendingDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);
  const [ignoreModal, setIgnoreModal] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');

  const clientId = searchParams.get('client_id') || '';

  const fetchClients = useCallback(async () => {
    try {
      const data = await api.get<ClientOption[]>('/clients');
      setClients(data);
    } catch {
      // Comodidad — si falla, se sigue pudiendo ver la cola sin filtrar por cliente.
    }
  }, []);

  const fetchPending = useCallback(async () => {
    if (!clientId) { setItems([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    try {
      const data = await api.get<PendingDevicesResponse>(`/clients/${clientId}/pending-devices?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId, q, page]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchPending(); }, [fetchPending]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [clientId, q]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((d) => d.id))));
  };

  const handleRegister = async () => {
    if (selected.size === 0) return;
    setActing(true);
    try {
      const result = await api.post<PendingDevicesActionResult>(`/clients/${clientId}/pending-devices/register`, {
        deviceIds: Array.from(selected),
      });
      showToast(`${result.registered ?? 0} equipo(s) registrado(s)`, 'success');
      setSelected(new Set());
      void fetchPending();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error al registrar', 'error');
    } finally {
      setActing(false);
    }
  };

  const handleIgnore = async () => {
    if (selected.size === 0 || !ignoreReason.trim()) return;
    setActing(true);
    try {
      const result = await api.post<PendingDevicesActionResult>(`/clients/${clientId}/pending-devices/ignore`, {
        deviceIds: Array.from(selected), reason: ignoreReason.trim(),
      });
      showToast(`${result.ignored ?? 0} equipo(s) ignorado(s)`, 'success');
      setSelected(new Set());
      setIgnoreModal(false);
      setIgnoreReason('');
      void fetchPending();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error al ignorar', 'error');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
          <UserCheck size={28} className="text-brand" /> Dispositivos Pendientes
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Equipos nuevos descubiertos por un agente, a la espera de aprobación — {total} en la cola del cliente seleccionado.
        </p>
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        <select value={clientId} onChange={(e) => setSearchParams(e.target.value ? { client_id: e.target.value } : {})}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Elegí un cliente...</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por serie, IP, hostname o modelo..."
            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold pl-9 pr-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="cd-panel bg-brand/5 border border-brand/20 rounded-2xl px-5 py-3 flex items-center gap-4 sticky top-2 z-10">
          <span className="text-xs font-extrabold text-brand-charcoal">{selected.size} seleccionado(s)</span>
          <div className="flex-1" />
          <button onClick={handleRegister} disabled={acting}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-50 flex items-center gap-2">
            {acting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Registrar
          </button>
          <button onClick={() => setIgnoreModal(true)} disabled={acting}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-extrabold transition-all disabled:opacity-50 flex items-center gap-2">
            <Ban size={14} /> Ignorar
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{error}</div>
      )}

      {!clientId ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 rounded-3xl border border-slate-100 border-dashed">
          <UserCheck size={48} className="mb-3 text-slate-300" />
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Elegí un cliente</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">La cola de pendientes se mira por cliente</p>
        </div>
      ) : loading ? (
        <div className="h-64 flex flex-col items-center justify-center animate-pulse">
          <Loader2 size={32} className="text-brand animate-spin mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando pendientes...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 rounded-3xl border border-slate-100 border-dashed">
          <UserCheck size={48} className="mb-3 text-slate-300" />
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Sin pendientes</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">No hay equipos esperando aprobación</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-brand">
                    {selected.size === items.length ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Monitor</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Serie</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">MAC</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">IP</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Hostname</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fabricante</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Descubierto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => toggleOne(d.id)}>
                  <td className="py-2.5 px-4">
                    <button onClick={(e) => { e.stopPropagation(); toggleOne(d.id); }} className="text-slate-400 hover:text-brand">
                      {selected.has(d.id) ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-700 font-bold">{d.agent_name || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] font-mono text-slate-600">{d.serial_number || '—'}</td>
                  <td className="py-2.5 px-4 text-[10px] font-mono text-slate-400">{d.mac || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] font-mono text-slate-600">{d.ip_address || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{d.hostname || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{d.brand || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{d.model || '—'}</td>
                  <td className="py-2.5 px-4 text-[10px] text-slate-500 font-medium">{fmtDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {clientId && items.length > 0 && (
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

      {ignoreModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm overflow-hidden">
            <header className="px-8 py-5 flex items-center justify-between text-white bg-gradient-to-r from-[#58595b] to-[#1a2333]">
              <h2 className="font-extrabold text-sm uppercase tracking-widest">Ignorar equipos</h2>
              <button onClick={() => { setIgnoreModal(false); setIgnoreReason(''); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </header>
            <div className="p-8 space-y-4">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Los {selected.size} equipo(s) seleccionado(s) dejarán de reportar lecturas hasta que alguien los reactive. Indicá el motivo:
              </p>
              <textarea value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} rows={3} autoFocus
                placeholder="Ej: impresora de otra empresa en la misma red"
                className="cd-input w-full !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm" />
              <div className="flex gap-4">
                <button onClick={() => { setIgnoreModal(false); setIgnoreReason(''); }} disabled={acting}
                  className="flex-1 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleIgnore} disabled={!ignoreReason.trim() || acting}
                  className="flex-1 px-6 py-3 rounded-xl text-white font-extrabold transition-all shadow-lg text-sm disabled:opacity-50 flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 shadow-rose-900/20">
                  {acting ? <Loader2 size={18} className="animate-spin" /> : 'Ignorar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingDevices;
