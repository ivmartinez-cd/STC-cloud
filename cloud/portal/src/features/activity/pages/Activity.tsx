import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { History, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import type { AuditLogItem, AuditLogsResponse, AuditActionOption, AuditCategory } from '../../../shared/types/audit';

interface ClientOption { id: string; name: string; }

const PAGE_SIZE = 50;

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  device: 'Dispositivos', agent: 'Agentes', client: 'Clientes', security: 'Seguridad',
  alert: 'Alertas', report: 'Reportes', user: 'Usuarios', other: 'Otro',
};

const CATEGORY_COLOR: Record<AuditCategory, string> = {
  device: 'bg-blue-100 text-blue-700',
  agent: 'bg-violet-100 text-violet-700',
  client: 'bg-emerald-100 text-emerald-700',
  security: 'bg-rose-100 text-rose-700',
  alert: 'bg-amber-100 text-amber-700',
  report: 'bg-slate-100 text-slate-600',
  user: 'bg-cyan-100 text-cyan-700',
  other: 'bg-slate-100 text-slate-500',
};

function fmtDate(v: string): string {
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function todayIso(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function targetHref(item: AuditLogItem): string | null {
  if (!item.target_id) return null;
  if (item.target_kind === 'device') return `/devices/${item.target_id}`;
  if (item.target_kind === 'agent') return `/monitors/${item.target_id}`;
  if (item.target_kind === 'client') return `/clients/${item.target_id}`;
  return null;
}

const Activity = () => {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [actionOptions, setActionOptions] = useState<AuditActionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [from, setFrom] = useState(todayIso(30));
  const [to, setTo] = useState(todayIso(0));
  const [category, setCategory] = useState('');
  const [action, setAction] = useState('');
  const [clientId, setClientId] = useState('');
  const [page, setPage] = useState(0);

  const fetchClients = useCallback(async () => {
    try {
      const data = await api.get<ClientOption[]>('/clients');
      setClients(data);
    } catch {
      // Comodidad — si falla, se sigue pudiendo ver el feed sin filtrar por cliente.
    }
  }, []);

  const fetchActions = useCallback(async () => {
    try {
      const data = await api.get<AuditActionOption[]>('/audit-logs/actions');
      setActionOptions(data);
    } catch {
      // Comodidad — si falla, se sigue pudiendo ver el feed sin filtrar por acción.
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', `${to}T23:59:59.999Z`);
    if (category) params.set('category', category);
    if (action) params.set('action', action);
    if (clientId) params.set('client_id', clientId);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    try {
      const data = await api.get<AuditLogsResponse>(`/audit-logs?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, category, action, clientId, page]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchActions(); }, [fetchActions]);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(0); }, [from, to, category, action, clientId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
          <History size={28} className="text-brand" /> Movimientos
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Historial de altas, bajas, movimientos y cambios de configuración — {total} en el rango seleccionado.
        </p>
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
        </label>
        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
        </label>

        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Toda categoría</option>
          {(Object.keys(CATEGORY_LABELS) as AuditCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Toda acción</option>
          {actionOptions.map((a) => (
            <option key={a.action} value={a.action}>{a.label} ({a.count})</option>
          ))}
        </select>

        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{error}</div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center animate-pulse">
          <Loader2 size={32} className="text-brand animate-spin mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando movimientos...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 rounded-3xl border border-slate-100 border-dashed">
          <History size={48} className="mb-3 text-slate-300" />
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Sin movimientos</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Ningún resultado con los filtros actuales</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Acción</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Objetivo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuario</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">IP</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => {
                const href = targetHref(item);
                const isExpanded = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                      <td className="py-2.5 px-4 text-[10px] text-slate-500 font-medium">{fmtDate(item.created_at)}</td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${CATEGORY_COLOR[item.category]}`}>
                          {item.action_label}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-600">
                        {href ? (
                          <Link to={href} onClick={(e) => e.stopPropagation()} className="hover:text-brand hover:underline">
                            {item.target_label || item.target_id}
                          </Link>
                        ) : (item.target_label || item.target_id || '—')}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-700 font-bold">{item.client_name || '—'}</td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-600">{item.user_username || '—'}</td>
                      <td className="py-2.5 px-4 text-[10px] font-mono text-slate-400">{item.ip_address || '—'}</td>
                      <td className="py-2.5 px-4 text-right">
                        <ChevronDown size={14} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={7} className="px-4 py-3">
                          <pre className="text-[10px] text-slate-500 whitespace-pre-wrap break-all font-mono">
                            {item.metadata ? JSON.stringify(typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata, null, 2) : 'Sin metadata'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Página {page + 1} de {totalPages}</span>
        <button
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Activity;
