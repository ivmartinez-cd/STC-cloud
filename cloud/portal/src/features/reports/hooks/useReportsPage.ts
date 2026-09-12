import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useUrlState, stringParam, pageParam, type UrlCodec } from '../../../shared/hooks/useUrlState';
import type { Closure, ClosureDetail, PreviewResponse } from '../types/reports';
import { displayDelta, rowFromClosureLine, rowFromPreview, type ReportRow } from '../lib/reportsPresentation';

interface ClientOption { id: string; name: string }

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const PERIOD_RE = /^\d{4}-\d{2}$/;
/** `?period=YYYY-MM`: ausente o inválido → mes actual (el default depende de la
 * fecha, así que cuando el usuario elige un período se escribe siempre, incluso
 * el actual, para que el link compartido abra ese mes y no "el de hoy"). */
const periodParam: UrlCodec<string> = {
  parse: (raw) => (raw && PERIOD_RE.test(raw) ? raw : currentPeriod()),
  format: (period) => (PERIOD_RE.test(period) ? period : null),
};

/** Cliente y período en la URL (auditoría 12/09/2026: volver de un equipo o F5
 * caía al primer cliente y al mes actual; "el cierre de junio de Acme" no se
 * podía compartir). `dpage` es la página del detalle (`useReportsDetailPaging`):
 * cambiar de cliente o período la resetea. */
const CODECS = { client_id: stringParam(), period: periodParam, dpage: pageParam };
type UrlSelection = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

function useClients(canPick: boolean) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => {
    if (!canPick) return;
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad: selector vacío si falla */ });
  }, [canPick]);
  return clients;
}

function useSelection(canPick: boolean, ownClientId: string | null) {
  const clients = useClients(canPick);
  const [url, patch] = useUrlState<UrlSelection>(CODECS);
  // Un client_viewer siempre ve el suyo; sin `?client_id=` cae al primero del
  // selector, sin escribir ese default en la URL.
  const selectedClientId = ownClientId || url.client_id || clients[0]?.id || '';
  const setSelectedClientId = useCallback((client_id: string) => patch({ client_id, dpage: 0 }), [patch]);
  const setPeriod = useCallback((period: string) => patch({ period, dpage: 0 }), [patch]);
  return { clients, selectedClientId, setSelectedClientId, period: url.period, setPeriod };
}

/** El cierre VIGENTE para (cliente, período) — el que no fue reemplazado por
 * uno nuevo tras una reapertura. Puede estar `closed` (activo) o `reopened`
 * (se trata como "sin cerrar", cae a la vista previa en vivo). */
function currentClosureFor(closures: Closure[], period: string): Closure | null {
  return closures.find((c) => c.period.startsWith(period) && !c.superseded_by) ?? null;
}

function useClosures(clientId: string) {
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchClosures = useCallback(async () => {
    if (!clientId) { setClosures([]); return; }
    setLoading(true);
    try { setClosures(await api.get<Closure[]>(`/clients/${clientId}/reports`)); }
    catch { setClosures([]); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { void fetchClosures(); }, [fetchClosures]);
  return { closures, closuresLoading: loading, fetchClosures };
}

/** Sólo el `useState` de la fuente de filas (preview o detalle) — separado por el límite de 20 líneas/función. */
function useRowsState() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { rows, setRows, loading, setLoading, error, setError };
}

async function requestRows(clientId: string, period: string, closure: Closure | null): Promise<ReportRow[]> {
  if (closure && closure.status === 'closed') {
    const detail = await api.get<ClosureDetail>(`/clients/${clientId}/reports/${closure.id}`);
    return detail.lines.map(rowFromClosureLine);
  }
  const preview = await api.get<PreviewResponse>(`/clients/${clientId}/reports/preview?period=${period}`);
  return preview.lines.map(rowFromPreview);
}

/** Trae la vista previa en vivo (período todavía no cerrado, o reabierto) o
 * el detalle persistido del cierre vigente — nunca ambos a la vez. */
function useRows(clientId: string, period: string, closure: Closure | null) {
  const st = useRowsState();
  const fetchRows = useCallback(async () => {
    if (!clientId) { st.setRows([]); st.setLoading(false); return; }
    st.setLoading(true);
    st.setError('');
    try {
      st.setRows(await requestRows(clientId, period, closure));
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, period, closure?.id, closure?.status]);
  useEffect(() => { void fetchRows(); }, [fetchRows]);
  return { ...st, fetchRows };
}

function kpisFrom(rows: ReportRow[]) {
  const totalPages = rows.reduce((a, r) => a + displayDelta(r), 0);
  const totalMono = rows.reduce((a, r) => a + r.deltaMono, 0);
  const totalColor = rows.reduce((a, r) => a + r.deltaColor, 0);
  const anomalies = rows.filter((r) => r.hadCounterReset).length;
  return { totalPages, totalMono, totalColor, deviceCount: rows.length, anomalies };
}

function useCloseAction(clientId: string, period: string, onDone: () => void) {
  const { showToast } = useToast();
  const [closing, setClosing] = useState(false);
  const close = async () => {
    if (!clientId) return;
    setClosing(true);
    try {
      await api.post(`/clients/${clientId}/reports/close`, { period });
      showToast(`Período ${period} cerrado`, 'success');
      onDone();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al cerrar el período', 'error');
    } finally {
      setClosing(false);
    }
  };
  return { closing, close };
}

export function useReportsPage() {
  const { role, clientId: ownClientId } = useAuth();
  const isReadOnlyViewer = role === 'client_viewer';
  const canManage = role === 'admin' || role === 'operator';

  const { clients, selectedClientId, setSelectedClientId, period, setPeriod } = useSelection(canManage, ownClientId);
  const { closures, closuresLoading, fetchClosures } = useClosures(selectedClientId);
  const closure = useMemo(() => currentClosureFor(closures, period), [closures, period]);
  const { rows, loading, error, fetchRows } = useRows(selectedClientId, period, closure);
  const kpis = useMemo(() => kpisFrom(rows), [rows]);
  const refetchAll = () => { void fetchClosures(); void fetchRows(); };
  const { closing, close } = useCloseAction(selectedClientId, period, refetchAll);

  return {
    isReadOnlyViewer, canManage, clients, selectedClientId, setSelectedClientId,
    period, setPeriod, closures, closuresLoading, closure, rows, loading, error, fetchRows,
    kpis, closing, close, fetchClosures,
  };
}

export type ReportsPageState = ReturnType<typeof useReportsPage>;
