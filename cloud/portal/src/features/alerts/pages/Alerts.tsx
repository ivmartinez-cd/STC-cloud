import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, ShieldCheck, CheckSquare, Square, AlertOctagon } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import BulkActionBar from '../../../shared/components/BulkActionBar';
import CreateIncidentModal from '../../incidents/components/CreateIncidentModal';
import type { Alert, AlertClass, AlertClassOption, ResponderOption, AlertSummary } from '../../../shared/types/alerts';

interface ClientOption { id: string; name: string; }

const PAGE_SIZE = 50;

const SEVERITY_LABELS: Record<string, string> = { critical: 'Crítico', warning: 'Advertencia' };

/**
 * Color por familia de clase — mismo criterio visual que HP SDS: rojo = ya
 * pasó algo (agotado/fallo/atasco), ámbar = se está por agotar/requiere
 * atención, slate = informativo, azul = disponibilidad/infraestructura.
 */
const CLASS_COLOR: Record<AlertClass, string> = {
  consumable_out: 'bg-rose-100 text-rose-700',
  system_failure: 'bg-rose-100 text-rose-700',
  jam: 'bg-rose-100 text-rose-700',
  subunit_out: 'bg-rose-100 text-rose-700',
  media_out: 'bg-rose-100 text-rose-700',
  consumable_low: 'bg-amber-100 text-amber-700',
  system_warning: 'bg-amber-100 text-amber-700',
  user_action: 'bg-amber-100 text-amber-700',
  subunit_low: 'bg-amber-100 text-amber-700',
  media_low: 'bg-amber-100 text-amber-700',
  information: 'bg-slate-100 text-slate-600',
  system_change: 'bg-slate-100 text-slate-600',
  other: 'bg-slate-100 text-slate-600',
  availability: 'bg-blue-100 text-blue-700',
};

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

  // Deep-link (`/alerts?class=jam&resolved=false`) — es lo que hacen clicables
  // los contadores de "Resumen de alertas por clase" del dashboard. `class` en
  // la URL (corto, legible) mapea a `alert_class` como query param de la API.
  const [searchParams, setSearchParams] = useSearchParams();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [classOptions, setClassOptions] = useState<AlertClassOption[]>([]);
  const [responderOptions, setResponderOptions] = useState<ResponderOption[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  // Fase 11 del gap analysis vs HP SDS — crear un incidente a partir de una alerta puntual.
  const [incidentModalAlert, setIncidentModalAlert] = useState<Alert | null>(null);

  const [severity, setSeverity] = useState('');
  const [alertClass, setAlertClass] = useState(() => searchParams.get('class') ?? '');
  const [resolved, setResolved] = useState<'false' | 'true' | ''>(() => {
    const fromUrl = searchParams.get('resolved');
    return fromUrl === 'true' || fromUrl === 'false' ? fromUrl : 'false';
  });
  const [acknowledged, setAcknowledged] = useState<'' | 'true' | 'false'>('');
  const [clientId, setClientId] = useState('');
  const [page, setPage] = useState(0);

  // Reflejar el filtro de clase en la URL — permite compartir/recargar el link
  // y es la mitad que falta del deep-link (la otra mitad es leerlo al montar,
  // arriba en el useState inicial).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (alertClass) next.set('class', alertClass); else next.delete('class');
    if (resolved) next.set('resolved', resolved); else next.delete('resolved');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertClass, resolved]);

  const fetchClients = useCallback(async () => {
    if (!canFilterByClient) return;
    try {
      const data = await api.get<ClientOption[]>('/clients');
      setClients(data);
    } catch {
      // El filtro de cliente es una comodidad — si falla, se sigue pudiendo ver alertas.
    }
  }, [canFilterByClient]);

  const fetchClasses = useCallback(async () => {
    try {
      const data = await api.get<{ classes: AlertClassOption[]; responders: ResponderOption[] }>('/alerts/classes');
      setClassOptions(data.classes);
      setResponderOptions(data.responders);
    } catch {
      // El filtro de clase es una comodidad — si falla, se sigue pudiendo ver alertas sin filtrar por clase.
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (severity) params.set('severity', severity);
    if (alertClass) params.set('alert_class', alertClass);
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
  }, [severity, alertClass, resolved, acknowledged, clientId, page]);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams();
    if (resolved) params.set('resolved', resolved);
    if (clientId) params.set('client_id', clientId);
    try {
      const data = await api.get<AlertSummary>(`/alerts/summary?${params.toString()}`);
      setSummary(data);
    } catch {
      // El contador de cabecera es informativo — si falla, la tabla igual funciona.
    }
  }, [resolved, clientId]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchClasses(); }, [fetchClasses]);
  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);

  // Reiniciar a la primera página cuando cambia cualquier filtro (evita quedar en
  // una página vacía si el filtro nuevo devuelve menos resultados).
  useEffect(() => { setPage(0); }, [severity, alertClass, resolved, acknowledged, clientId]);

  const updateAlert = async (id: number, patch: { acknowledged?: boolean; resolved?: boolean }) => {
    setPendingId(id);
    try {
      const updated = await api.put<Partial<Alert>>(`/alerts/${id}`, patch);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      showToast(patch.resolved !== undefined ? 'Alerta resuelta' : 'Alerta reconocida', 'success');
      void fetchSummary();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al actualizar la alerta', 'error');
    } finally {
      setPendingId(null);
    }
  };

  // Selección múltiple (Fase 9 del gap analysis vs HP SDS) — deliberadamente
  // sólo sobre `alerts` (la página VISIBLE), nunca "todo lo que matchea el
  // filtro": un usuario nunca debe poder reconocer/resolver algo que no llegó
  // a ver. Se limpia al cambiar de página o de filtro.
  const rowSelection = useRowSelection(alerts.map((a) => a.id));
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => { rowSelection.clear(); }, [alerts]); // eslint-disable-line react-hooks/exhaustive-deps

  const bulkUpdate = async (patch: { acknowledged?: boolean; resolved?: boolean }) => {
    setBulkBusy(true);
    try {
      const ids = Array.from(rowSelection.selected);
      const result = await api.post<{ count: number; applied: number[]; skipped: Array<{ id: number; reason: string }> }>(
        '/alerts/bulk', { ids, ...patch }
      );
      showToast(`${result.count} alerta(s) actualizadas`, result.count > 0 ? 'success' : 'error');
      rowSelection.clear();
      void fetchAlerts();
      void fetchSummary();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al actualizar en bloque', 'error');
    } finally {
      setBulkBusy(false);
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
        {summary && (
          <div className="text-right">
            <p className="text-2xl font-extrabold text-[#1a2333]">{summary.total}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {summary.bySeverity.critical} críticas · {summary.bySeverity.warning} advertencias
            </p>
          </div>
        )}
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Toda severidad</option>
          <option value="critical">Crítico</option>
          <option value="warning">Advertencia</option>
        </select>

        <select value={alertClass} onChange={(e) => setAlertClass(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Toda clase</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
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
      ) : alerts.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
          <ShieldCheck size={48} className="mb-3 text-emerald-500" />
          <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Sin alertas</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Ningún resultado con los filtros actuales</p>
        </div>
      ) : (
        <>
          {!isReadOnlyViewer && (
            <BulkActionBar count={rowSelection.count} onClear={rowSelection.clear}>
              <button disabled={bulkBusy} onClick={() => bulkUpdate({ acknowledged: true })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                <Check size={13} /> Reconocer
              </button>
              <button disabled={bulkBusy} onClick={() => bulkUpdate({ resolved: true })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                <CheckCircle2 size={13} /> Resolver
              </button>
            </BulkActionBar>
          )}
        <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {!isReadOnlyViewer && (
                  <th className="py-3 px-4 w-8">
                    <button onClick={rowSelection.toggleAll} className="text-slate-400 hover:text-brand" title="Seleccionar todos">
                      {rowSelection.allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                )}
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Severidad</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Monitor / Equipo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Código</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Clase</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Acción</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                {!isReadOnlyViewer && (
                  <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {alerts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                  {!isReadOnlyViewer && (
                    <td className="py-2.5 px-4">
                      <button onClick={() => rowSelection.toggle(a.id)} className="text-slate-300 hover:text-brand">
                        {rowSelection.selected.has(a.id) ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} />}
                      </button>
                    </td>
                  )}
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
                  <td className="py-2.5 px-4 text-[10px] font-mono text-slate-500" title={a.type}>{a.type}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600 max-w-[280px] truncate" title={a.message}>
                    {a.alert_reason || a.message}
                  </td>
                  <td className="py-2.5 px-4">
                    {a.alert_class ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${CLASS_COLOR[a.alert_class]}`}>
                        {classOptions.find((c) => c.id === a.alert_class)?.label ?? a.alert_class}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-[10px] font-bold text-slate-500">
                    {a.responder ? (responderOptions.find((r) => r.id === a.responder)?.label ?? a.responder) : '—'}
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
                        {a.incident_id ? (
                          <Link
                            to={`/incidents/${a.incident_id}`}
                            onClick={(ev) => ev.stopPropagation()}
                            title={`Incidente #${a.incident_number}`}
                            className="p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all"
                          >
                            <AlertOctagon size={14} />
                          </Link>
                        ) : (
                          <button
                            onClick={() => setIncidentModalAlert(a)}
                            title="Crear incidente"
                            className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"
                          >
                            <AlertOctagon size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
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

      <CreateIncidentModal
        isOpen={!!incidentModalAlert}
        onClose={() => setIncidentModalAlert(null)}
        onCreated={() => { void fetchAlerts(); }}
        clients={clients}
        initialClientId={incidentModalAlert?.client_id ?? undefined}
        initialDeviceId={incidentModalAlert?.device_id ?? undefined}
        initialClass={incidentModalAlert?.alert_class ?? undefined}
        initialAlertIds={incidentModalAlert ? [incidentModalAlert.id] : undefined}
      />
    </div>
  );
};

export default Alerts;
