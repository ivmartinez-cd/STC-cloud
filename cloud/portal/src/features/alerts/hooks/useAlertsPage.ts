import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import type { Alert, AlertClassOption, ResponderOption, AlertSummary } from '../../../shared/types/alerts';
import { PAGE_SIZE } from '../lib/alertPresentation';

export interface ClientOption { id: string; name: string; }
export type ResolvedFilter = 'false' | 'true' | '';
export type AcknowledgedFilter = '' | 'true' | 'false';
export type AlertPatch = { acknowledged?: boolean; resolved?: boolean };

export interface AlertFiltersState {
  severity: string; setSeverity: (v: string) => void;
  alertClass: string; setAlertClass: (v: string) => void;
  resolved: ResolvedFilter; setResolved: (v: ResolvedFilter) => void;
  acknowledged: AcknowledgedFilter; setAcknowledged: (v: AcknowledgedFilter) => void;
  clientId: string; setClientId: (v: string) => void;
}

/**
 * `class` y `resolved` viven también en la URL (`/alerts?class=jam&resolved=false`):
 * es lo que hacen clicables los contadores del dashboard y permite compartir el link.
 * La mitad "leer al montar" está en los useState iniciales de useAlertFilters.
 */
function useUrlSync(alertClass: string, resolved: ResolvedFilter) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (alertClass) next.set('class', alertClass); else next.delete('class');
    if (resolved) next.set('resolved', resolved); else next.delete('resolved');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertClass, resolved]);
  return searchParams;
}

function initialResolved(params: URLSearchParams): ResolvedFilter {
  const fromUrl = params.get('resolved');
  return fromUrl === 'true' || fromUrl === 'false' ? fromUrl : 'false';
}

function useAlertFilters(): AlertFiltersState {
  const [initial] = useSearchParams();
  const [severity, setSeverity] = useState('');
  const [alertClass, setAlertClass] = useState(() => initial.get('class') ?? '');
  const [resolved, setResolved] = useState<ResolvedFilter>(() => initialResolved(initial));
  const [acknowledged, setAcknowledged] = useState<AcknowledgedFilter>('');
  const [clientId, setClientId] = useState('');
  useUrlSync(alertClass, resolved);
  return { severity, setSeverity, alertClass, setAlertClass, resolved, setResolved, acknowledged, setAcknowledged, clientId, setClientId };
}

/** Catálogos de apoyo. Best-effort: si fallan, la tabla igual funciona. */
function useAlertCatalogs(canFilterByClient: boolean) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [classOptions, setClassOptions] = useState<AlertClassOption[]>([]);
  const [responderOptions, setResponderOptions] = useState<ResponderOption[]>([]);

  useEffect(() => {
    if (!canFilterByClient) return;
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad: sin filtro de cliente */ });
  }, [canFilterByClient]);

  useEffect(() => {
    api.get<{ classes: AlertClassOption[]; responders: ResponderOption[] }>('/alerts/classes')
      .then((d) => { setClassOptions(d.classes); setResponderOptions(d.responders); })
      .catch(() => { /* comodidad: se ve sin etiquetas de clase */ });
  }, []);

  return { clients, classOptions, responderOptions };
}

function buildListParams(f: AlertFiltersState, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.severity) params.set('severity', f.severity);
  if (f.alertClass) params.set('alert_class', f.alertClass);
  if (f.resolved) params.set('resolved', f.resolved);
  if (f.acknowledged) params.set('acknowledged', f.acknowledged);
  if (f.clientId) params.set('client_id', f.clientId);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(page * PAGE_SIZE));
  return params;
}

/** Contador de cabecera (informativo: si falla, la tabla igual funciona). */
function useAlertSummary(resolved: ResolvedFilter, clientId: string) {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams();
    if (resolved) params.set('resolved', resolved);
    if (clientId) params.set('client_id', clientId);
    try {
      setSummary(await api.get<AlertSummary>(`/alerts/summary?${params.toString()}`));
    } catch { /* informativo */ }
  }, [resolved, clientId]);
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, fetchSummary };
}

/** Página actual del listado, reactiva a filtros y página. */
function useAlertRows(filters: AlertFiltersState, page: number) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { severity, alertClass, resolved, acknowledged, clientId } = filters;
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAlerts(await api.get<Alert[]>(`/alerts?${buildListParams(filters, page).toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, alertClass, resolved, acknowledged, clientId, page]);
  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);
  return { alerts, setAlerts, loading, error, fetchAlerts };
}

function useAlertList(filters: AlertFiltersState) {
  const [page, setPage] = useState(0);
  const { severity, alertClass, resolved, acknowledged, clientId } = filters;
  // Primera página al cambiar cualquier filtro (evita quedar en una página vacía).
  useEffect(() => { setPage(0); }, [severity, alertClass, resolved, acknowledged, clientId]);
  return { page, setPage, ...useAlertRows(filters, page), ...useAlertSummary(resolved, clientId) };
}

type AlertList = ReturnType<typeof useAlertList>;

function useUpdateAlert(list: AlertList) {
  const { showToast } = useToast();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const updateAlert = async (id: number, patch: AlertPatch) => {
    setPendingId(id);
    try {
      const updated = await api.put<Partial<Alert>>(`/alerts/${id}`, patch);
      list.setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
      showToast(patch.resolved !== undefined ? 'Alerta resuelta' : 'Alerta reconocida', 'success');
      void list.fetchSummary();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al actualizar la alerta', 'error');
    } finally {
      setPendingId(null);
    }
  };
  return { pendingId, updateAlert };
}

async function postBulk(ids: number[], patch: AlertPatch): Promise<number> {
  const result = await api.post<{ count: number }>('/alerts/bulk', { ids, ...patch });
  return result.count;
}

/** Selección múltiple sólo sobre la página visible: nunca se reconoce/resuelve lo que no se vio. */
function useBulkUpdate(list: AlertList) {
  const { showToast } = useToast();
  const [bulkBusy, setBulkBusy] = useState(false);
  const rowSelection = useRowSelection(list.alerts.map((a) => a.id));
  useEffect(() => { rowSelection.clear(); }, [list.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulkUpdate = async (patch: AlertPatch) => {
    setBulkBusy(true);
    try {
      const count = await postBulk(Array.from(rowSelection.selected), patch);
      showToast(`${count} alerta(s) actualizadas`, count > 0 ? 'success' : 'error');
      rowSelection.clear();
      void Promise.all([list.fetchAlerts(), list.fetchSummary()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al actualizar en bloque', 'error');
    } finally {
      setBulkBusy(false);
    }
  };
  return { bulkBusy, rowSelection, bulkUpdate };
}

export function useAlertsPage() {
  const { role } = useAuth();
  // client_viewer ve /alerts pero no reconoce/resuelve (PUT /alerts/:id no está
  // en CLIENT_VIEWER_ROUTES): se ocultan los botones, mismo criterio que MonitorDetail.
  const isReadOnlyViewer = role === 'client_viewer';
  const canFilterByClient = role === 'admin' || role === 'operator';
  const filters = useAlertFilters();
  const catalogs = useAlertCatalogs(canFilterByClient);
  const list = useAlertList(filters);
  const [incidentModalAlert, setIncidentModalAlert] = useState<Alert | null>(null);
  return {
    isReadOnlyViewer, canFilterByClient, filters, ...catalogs, ...list,
    ...useUpdateAlert(list), ...useBulkUpdate(list), incidentModalAlert, setIncidentModalAlert,
  };
}

export type AlertsPageState = ReturnType<typeof useAlertsPage>;
