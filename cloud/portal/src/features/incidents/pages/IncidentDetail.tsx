import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBackNavigation } from '../../../shared/hooks/useBackNavigation';
import { useReturnParam } from '../../../shared/hooks/useReturnParam';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import {
  ArrowLeft, AlertOctagon, Loader2, MessageSquare, CheckCircle2, RotateCcw,
  Link2, Unlink, Clock, User,
} from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import type { IncidentDetail as IncidentDetailType } from '../../../shared/types/incidents';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS, type IncidentStatus } from '../../../shared/lib/constants';
import { APP_LOCALE } from '../../../shared/lib/formatters';
import SimplePagination from '../../../shared/components/SimplePagination';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const EVENT_LABELS: Record<string, string> = {
  comment: 'Comentario', status_change: 'Cambio de estado', assign: 'Asignación',
  link_alert: 'Alerta vinculada', unlink_alert: 'Alerta desvinculada', external_id: 'ID externo',
  reopen: 'Reapertura', sla_breached: 'SLA vencido',
};

const IncidentDetail = () => {
  const { id } = useParams<{ id: string }>();
  // Vuelve por historial (conserva filtros/página del listado) o al listado si se
  // entró por URL directa — antes `navigate('/incidents')` apilaba y "atrás" reabría el detalle.
  const { goBack } = useBackNavigation();
  // `from`: desde la ficha del equipo se vuelve a este incidente, no al listado.
  const returnParam = useReturnParam();
  const { role } = useAuth();
  const { showToast } = useToast();
  const canManage = role === 'admin' || role === 'operator';

  const [incident, setIncident] = useState<IncidentDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const beginRequest = useLatestRequest();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  // 6 por página en vez de scroll interno (rediseño sin scroll, 27/08/2026).
  const alertsPager = useClientPagination(incident?.alerts ?? [], 6);
  const eventsPager = useClientPagination(incident?.events ?? [], 6);


  // `isLatest`: cerrar/reabrir y comentar disparan refetch; el que quede atrás no
  // pisa la pantalla. `setError('')` al empezar: sin eso una falla transitoria
  // dejaba el incidente en error aunque el reintento anduviera.
  const fetchIncident = useCallback(async () => {
    if (!id) return;
    const isLatest = beginRequest();
    setLoading(true);
    setError('');
    try {
      const data = await api.get<IncidentDetailType>(`/incidents/${id}`);
      if (isLatest()) setIncident(data);
    } catch (e) {
      if (isLatest()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [id, beginRequest]);

  useEffect(() => { void fetchIncident(); }, [fetchIncident]);

  const setStatus = async (status: IncidentStatus) => {
    if (!id || status === 'closed') return;
    setBusy(true);
    try {
      await api.post(`/incidents/${id}/status`, { status });
      await fetchIncident();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al cambiar el estado', 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!id) return;
    const reason = window.prompt('Motivo de cierre (opcional):') ?? '';
    setBusy(true);
    try {
      await api.post(`/incidents/${id}/close`, { reason: reason || undefined });
      showToast('Incidente cerrado', 'success');
      await fetchIncident();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al cerrar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api.post(`/incidents/${id}/reopen`, {});
      showToast('Incidente reabierto', 'success');
      await fetchIncident();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al reabrir', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    if (!id || !comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/incidents/${id}/comments`, { body: comment.trim() });
      setComment('');
      await fetchIncident();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al comentar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const unlinkAlert = async (alertId: number) => {
    if (!id) return;
    setBusy(true);
    try {
      await api.delete(`/incidents/${id}/alerts/${alertId}`);
      await fetchIncident();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al desvincular', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center animate-pulse">
        <Loader2 size={32} className="text-brand animate-spin mb-3" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando incidente...</p>
      </div>
    );
  }
  if (error || !incident) {
    return <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{error || 'Incidente no encontrado'}</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <button onClick={goBack} className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-brand transition-colors">
        <ArrowLeft size={14} /> Volver a incidentes
      </button>

      <header className="cd-panel bg-white border border-slate-100 rounded-3xl p-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <AlertOctagon size={22} className="text-brand" />
            <h1 className="text-2xl font-extrabold text-[#1a2333] tracking-tight">#{incident.number} — {incident.title}</h1>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${INCIDENT_STATUS_COLORS[incident.status]}`}>
              {INCIDENT_STATUS_LABELS[incident.status]}
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium mt-2">
            {incident.client_name} {incident.device_label ? `· ${incident.device_label}` : ''} {incident.device_serial ? `(${incident.device_serial})` : ''}
          </p>
          {incident.description && <p className="text-slate-600 text-sm mt-2">{incident.description}</p>}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {incident.status !== 'closed' ? (
              <>
                <select
                  value={incident.status}
                  onChange={(e) => setStatus(e.target.value as IncidentStatus)}
                  disabled={busy}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer"
                >
                  <option value="open">Abierto</option>
                  <option value="in_progress">En curso</option>
                  <option value="on_hold">En espera</option>
                </select>
                <button onClick={close} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                  <CheckCircle2 size={13} /> Cerrar
                </button>
              </>
            ) : (
              <button onClick={reopen} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                <RotateCcw size={13} /> Reabrir
              </button>
            )}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clase</p>
          <p className="text-sm font-bold text-slate-700 mt-1">{incident.class}</p>
        </div>
        <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Origen</p>
          <p className="text-sm font-bold text-slate-700 mt-1">{incident.origin === 'auto' ? 'Automático (regla)' : 'Manual'}</p>
        </div>
        <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Abierto</p>
          <p className="text-sm font-bold text-slate-700 mt-1">{fmtDate(incident.opened_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-6">
          <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-2 mb-4">
            <Link2 size={16} className="text-brand" /> Alertas vinculadas ({incident.alerts.length})
          </h3>
          {incident.alerts.length === 0 ? (
            <p className="text-xs text-slate-400 font-medium">Ninguna alerta vinculada.</p>
          ) : (
            <div className="space-y-2">
              {alertsPager.visible.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-slate-500 truncate">{a.type}</p>
                    <p className="text-[11px] text-slate-600 truncate">{a.alert_reason || a.message}</p>
                  </div>
                  {canManage && (
                    <button onClick={() => unlinkAlert(a.id)} disabled={busy} className="shrink-0 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Desvincular">
                      <Unlink size={14} />
                    </button>
                  )}
                </div>
              ))}
              <SimplePagination page={alertsPager.page} pageSize={alertsPager.pageSize} total={alertsPager.total} onPageChange={alertsPager.setPage} />
            </div>
          )}
        </div>

        <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-6">
          <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-2 mb-4">
            <Clock size={16} className="text-brand" /> Timeline
          </h3>
          <div className="space-y-3">
            {eventsPager.visible.map((e) => (
              <div key={e.id} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {EVENT_LABELS[e.kind] ?? e.kind} · {fmtDate(e.created_at)} {e.user_username ? `· ${e.user_username}` : ''}
                  </p>
                  {e.body && <p className="text-xs text-slate-600 mt-0.5">{e.body}</p>}
                </div>
              </div>
            ))}
            <SimplePagination page={eventsPager.page} pageSize={eventsPager.pageSize} total={eventsPager.total} onPageChange={eventsPager.setPage} />
          </div>
          {canManage && (
            <div className="mt-4 flex items-center gap-2">
              <input
                value={comment} onChange={(ev) => setComment(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') void addComment(); }}
                placeholder="Agregar comentario..."
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button onClick={addComment} disabled={busy || !comment.trim()} className="p-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl disabled:opacity-50">
                <MessageSquare size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {incident.device_id && (
        <Link to={`/devices/${incident.device_id}?${returnParam}`} className="inline-flex items-center gap-2 text-xs font-bold text-brand hover:underline">
          <User size={14} /> Ver ficha del equipo
        </Link>
      )}
    </div>
  );
};

export default IncidentDetail;
