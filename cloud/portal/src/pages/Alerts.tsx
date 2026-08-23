import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Alert } from '../types/alerts';

interface ClientOption { id: string; name: string; }

const PAGE_SIZE = 50;

type TypeCategory = 'all' | 'toner' | 'counter_reset' | 'agent_offline' | 'device_offline' | 'other';

/**
 * `type` es texto libre (códigos de vendor para EWS, `toner_<color>_low/critical`,
 * etc.) — categorizar del lado del cliente en vez de pedirle al usuario un valor
 * exacto, mismo criterio que ya usa `Dashboard.tsx` (`type.startsWith('toner_')`).
 */
function categoryOf(type: string): TypeCategory {
  if (type.startsWith('toner_')) return 'toner';
  if (type === 'counter_reset') return 'counter_reset';
  if (type === 'agent_offline') return 'agent_offline';
  if (type === 'device_offline') return 'device_offline';
  return 'other';
}

const CATEGORY_LABELS: Record<TypeCategory, string> = {
  all: 'Todos los tipos',
  toner: 'Tóner',
  counter_reset: 'Reset de contador',
  agent_offline: 'Monitor sin señal',
  device_offline: 'Equipo sin señal',
  other: 'Otro (EWS)',
};

const SEVERITY_LABELS: Record<string, string> = { critical: 'Crítico', warning: 'Advertencia' };

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const Alerts = () => {
  const { role } = useAuth();
  const { showToast } = useToast();
  // client_viewer puede ver /alerts (ya está en su allowlist de RBAC) pero no
  // reconocer/resolver — PUT /alerts/:id no está en CLIENT_VIEWER_ROUTES y el
  // backend lo devuelve 403; acá se ocultan los botones directamente, mismo
  // criterio que MonitorDetail.tsx/ClientDetail.tsx.
  const isReadOnlyViewer = role === 'client_viewer';
  const canFilterByClient = role === 'admin' || role === 'operator';

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);

  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState<TypeCategory>('all');
  const [resolved, setResolved] = useState<'false' | 'true' | ''>('false');
  const [acknowledged, setAcknowledged] = useState<'' | 'true' | 'false'>('');
  const [clientId, setClientId] = useState('');
  const [page, setPage] = useState(0);

  const fetchClients = useCallback(async () => {
    if (!canFilterByClient) return;
    try {
      const data = await api.get<ClientOption[]>('/clients');
      setClients(data);
    } catch {
      // El filtro de cliente es una comodidad — si falla, se sigue pudiendo ver alertas.
    }
  }, [canFilterByClient]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (severity) params.set('severity', severity);
    if (resolved) params.set('resolved', resolved);
    if (acknowledged) params.set('acknowledged', acknowledged);
    if (clientId) params.set('client_id', clientId);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    try {
      const data = await api.get<Alert[]>(`/alerts?${params.toString()}`);
      setAlerts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [severity, resolved, acknowledged, clientId, page]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);

  // Reiniciar a la primera página cuando cambia cualquier filtro (evita quedar en
  // una página vacía si el filtro nuevo devuelve menos resultados).
  useEffect(() => { setPage(0); }, [severity, resolved, acknowledged, clientId]);

  const filtered = useMemo(
    () => (category === 'all' ? alerts : alerts.filter((a) => categoryOf(a.type) === category)),
    [alerts, category]
  );

  const updateAlert = async (id: number, patch: { acknowledged?: boolean; resolved?: boolean }) => {
    setPendingId(id);
    try {
      const updated = await api.put<Partial<Alert>>(`/alerts/${id}`, patch);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      showToast(patch.resolved !== undefined ? 'Alerta resuelta' : 'Alerta reconocida', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al actualizar la alerta', 'error');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
            <Bell size={28} className="text-brand" /> Alertas
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Tóner, resets de contador, monitores y equipos sin señal.
          </p>
        </div>
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Toda severidad</option>
          <option value="critical">Crítico</option>
          <option value="warning">Advertencia</option>
        </select>

        <select value={category} onChange={(e) => setCategory(e.target.value as TypeCategory)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          {(Object.keys(CATEGORY_LABELS) as TypeCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <select value={resolved} onChange={(e) => setResolved(e.target.value as 'false' | 'true' | '')}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="false">Sin resolver</option>
          <option value="true">Resueltas</option>
          <option value="">Todas</option>
        </select>

        <select value={acknowledged} onChange={(e) => setAcknowledged(e.target.value as '' | 'true' | 'false')}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Reconocida o no</option>
          <option value="false">Sin reconocer</option>
          <option value="true">Reconocidas</option>
        </select>

        {canFilterByClient && (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{error}</div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center animate-pulse">
          <Loader2 size={32} className="text-brand animate-spin mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando alertas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
          <ShieldCheck size={48} className="mb-3 text-emerald-500" />
          <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Sin alertas</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Ningún resultado con los filtros actuales</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Severidad</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Monitor / Equipo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Mensaje</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                {!isReadOnlyViewer && (
                  <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                      a.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {SEVERITY_LABELS[a.severity] ?? a.severity}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-700 font-bold">{a.client_name || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">
                    {a.device_id ? (
                      <Link to={`/devices/${a.device_id}`} className="hover:text-brand hover:underline">
                        {a.device_name || a.serial || 'Dispositivo'}
                      </Link>
                    ) : a.agent_id ? (
                      <Link to={`/monitors/${a.agent_id}`} className="hover:text-brand hover:underline">
                        {a.agent_name || 'Monitor'}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600 max-w-[320px] truncate" title={a.message}>
                    {a.message}
                  </td>
                  <td className="py-2.5 px-4 text-[10px] text-slate-500 font-medium">{fmtDate(a.created_at)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex flex-col gap-1">
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${a.resolved ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {a.resolved ? 'Resuelta' : 'Activa'}
                      </span>
                      {a.acknowledged && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gray">Reconocida</span>
                      )}
                    </div>
                  </td>
                  {!isReadOnlyViewer && (
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!a.acknowledged && (
                          <button
                            disabled={pendingId === a.id}
                            onClick={() => updateAlert(a.id, { acknowledged: true })}
                            title="Reconocer"
                            className="p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all disabled:opacity-50"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {!a.resolved && (
                          <button
                            disabled={pendingId === a.id}
                            onClick={() => updateAlert(a.id, { resolved: true })}
                            title="Resolver"
                            className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        {a.acknowledged && a.resolved && (
                          <AlertTriangle size={14} className="text-slate-200" />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
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
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Página {page + 1}</span>
        <button
          disabled={alerts.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
          className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Alerts;
