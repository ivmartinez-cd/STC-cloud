import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import type { Alert, AlertSummary } from '../../../shared/types/alerts';
import { PAGE_SIZE } from '../lib/alertPresentation';

export type ClientOption = { id: string; name: string };
export type AlertPatch = { acknowledged?: boolean; resolved?: boolean };

export interface AlertFiltersState {
  q: string; setQ: (v: string) => void;
  unresolved: boolean; setUnresolved: (v: boolean) => void;
  critical: boolean; setCritical: (v: boolean) => void;
  unacknowledged: boolean; setUnacknowledged: (v: boolean) => void;
  availability: boolean; setAvailability: (v: boolean) => void;
  last24h: boolean; setLast24h: (v: boolean) => void;
  /** Deep-link únicamente (`/alerts?client_id=` desde Cliente Detalle) — sin chip propio. */
  clientId: string;
}

/** `class`/`resolved`/`client_id` en la URL: lo que hace clicables los contadores
 * del dashboard/detalle de cliente y permite compartir el link. */
function useUrlSync(unresolved: boolean, availability: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (!unresolved) next.set('resolved', ''); else next.delete('resolved');
    if (availability) next.set('class', 'availability'); else next.delete('class');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unresolved, availability]);
}

function useAlertFilters(): AlertFiltersState {
  const [initial] = useSearchParams();
  const [q, setQ] = useState('');
  const [unresolved, setUnresolved] = useState(() => initial.get('resolved') !== '');
  const [critical, setCritical] = useState(false);
  const [unacknowledged, setUnacknowledged] = useState(false);
  const [availability, setAvailability] = useState(() => initial.get('class') === 'availability');
  const [last24h, setLast24h] = useState(false);
  const [clientId] = useState(() => initial.get('client_id') ?? '');
  useUrlSync(unresolved, availability);
  return { q, setQ, unresolved, setUnresolved, critical, setCritical, unacknowledged, setUnacknowledged, availability, setAvailability, last24h, setLast24h, clientId };
}

/** Catálogos de apoyo: clases (etiqueta de la columna CLASE) y clientes (sólo
 * para el selector DENTRO de `CreateIncidentModal` — la barra de filtros
 * rediseñada ya no tiene selector manual de cliente). Best-effort. */
function useAlertCatalogs(canFilterByClient: boolean) {
  const [classLabels, setClassLabels] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => {
    api.get<{ classes: Array<{ id: string; label: string }> }>('/alerts/classes')
      .then((d) => setClassLabels(Object.fromEntries(d.classes.map((c) => [c.id, c.label]))))
      .catch(() => { /* comodidad: se ve sin etiqueta de clase */ });
  }, []);
  useEffect(() => {
    if (!canFilterByClient) return;
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad: modal sin selector de cliente */ });
  }, [canFilterByClient]);
  return { classLabels, clients };
}

export function buildAlertsQueryParams(f: AlertFiltersState, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim().length >= 2) params.set('q', f.q.trim());
  if (f.unresolved) params.set('resolved', 'false');
  if (f.critical) params.set('severity', 'critical');
  if (f.unacknowledged) params.set('acknowledged', 'false');
  if (f.availability) params.set('alert_class', 'availability');
  if (f.last24h) params.set('max_age_hours', '24');
  if (f.clientId) params.set('client_id', f.clientId);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(page * PAGE_SIZE));
  return params;
}

function requestAlertSummary(unresolved: boolean, clientId: string): Promise<AlertSummary> {
  const params = new URLSearchParams();
  params.set('resolved', unresolved ? 'false' : '');
  if (clientId) params.set('client_id', clientId);
  return api.get<AlertSummary>(`/alerts/summary?${params.toString()}`);
}

/** Tira de 4 métricas: independiente de los chips de la tabla — sólo reacciona
 * a `resolved`/`client_id`, mismo criterio que el resto de los summaries del portal. */
function useAlertSummary(unresolved: boolean, clientId: string) {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try { setSummary(await requestAlertSummary(unresolved, clientId)); }
    catch { setSummaryError(true); }
    finally { setSummaryLoading(false); }
  }, [unresolved, clientId]);
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, fetchSummary };
}

/** Página actual + total real (`/alerts` + `/alerts/count`, handoff hifi #3 — antes "ciega"). */
async function requestAlertPage(filters: AlertFiltersState, page: number): Promise<{ items: Alert[]; total: number }> {
  const qs = buildAlertsQueryParams(filters, page).toString();
  const [items, count] = await Promise.all([
    api.get<Alert[]>(`/alerts?${qs}`),
    api.get<{ total: number }>(`/alerts/count?${qs}`),
  ]);
  return { items, total: count.total };
}

/** Sólo el `useState` — separado de `useAlertRows` por el límite de 20 líneas/función. */
function useAlertRowsState() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { alerts, setAlerts, total, setTotal, loading, setLoading, error, setError };
}

function useAlertRows(filters: AlertFiltersState, page: number, debouncedQ: string) {
  const st = useAlertRowsState();
  const effective = { ...filters, q: debouncedQ };
  const fetchAlerts = useCallback(async () => {
    st.setLoading(true);
    st.setError('');
    try {
      const { items, total: t } = await requestAlertPage(effective, page);
      st.setAlerts(items);
      st.setTotal(t);
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.unresolved, filters.critical, filters.unacknowledged, filters.availability, filters.last24h, filters.clientId, page]);
  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);
  return { ...st, totalPages: Math.max(1, Math.ceil(st.total / PAGE_SIZE)), fetchAlerts };
}

function useAlertList(filters: AlertFiltersState) {
  const [page, setPage] = useState(0);
  const debouncedQ = useDebounce(filters.q, 300);
  useEffect(() => { setPage(0); }, [debouncedQ, filters.unresolved, filters.critical, filters.unacknowledged, filters.availability, filters.last24h, filters.clientId]);
  return { page, setPage, ...useAlertRows(filters, page, debouncedQ), ...useAlertSummary(filters.unresolved, filters.clientId) };
}

type AlertList = ReturnType<typeof useAlertList>;

/** "Agrupar por código" (handoff hifi #3, 26/08/2026) — toggle de vista sobre la
 * página visible, no una consulta nueva: agrupa lo ya traído por el mismo
 * derivador de código que usa el backend en `/alerts/summary#byCode`. */
export function codeOf(a: Pick<Alert, 'alert_class' | 'type'>): string {
  return a.alert_class === 'availability' ? a.type : (a.alert_class ?? 'other');
}

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

/** Cliente/equipo/clase pre-cargados en `CreateIncidentModal` sólo si son
 * uniformes en la selección — mezclar clientes/equipos distintos bajo un
 * mismo valor precargado sería silenciosamente incorrecto. */
export function deriveIncidentContext(alerts: Alert[]): { clientId?: string; deviceId?: string; alertClass?: string } {
  const clientIds = new Set(alerts.map((a) => a.client_id).filter(Boolean));
  const deviceIds = new Set(alerts.map((a) => a.device_id).filter(Boolean));
  const classes = new Set(alerts.map((a) => a.alert_class).filter(Boolean));
  return {
    clientId: clientIds.size === 1 ? (alerts[0].client_id ?? undefined) : undefined,
    deviceId: deviceIds.size === 1 ? (alerts[0].device_id ?? undefined) : undefined,
    alertClass: classes.size === 1 ? (alerts[0].alert_class ?? undefined) : undefined,
  };
}

/** Selección múltiple sólo sobre la página visible: nunca se reconoce lo que no se vio. */
type Toast = (msg: string, kind: 'success' | 'error') => void;

/** Reconocer en bloque, compartido por la barra de selección y por "RECONOCER
 * TODAS" del header — mismo request, mismo manejo de error/refetch. */
async function acknowledgeIds(ids: number[], showToast: Toast, list: AlertList, setBulkBusy: (v: boolean) => void, onDone?: () => void): Promise<void> {
  if (ids.length === 0) return;
  setBulkBusy(true);
  try {
    const count = await postBulk(ids, { acknowledged: true });
    showToast(`${count} alerta(s) reconocidas`, count > 0 ? 'success' : 'error');
    onDone?.();
    void Promise.all([list.fetchAlerts(), list.fetchSummary()]);
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Error al reconocer en bloque', 'error');
  } finally {
    setBulkBusy(false);
  }
}

function useBulkUpdate(list: AlertList) {
  const { showToast } = useToast();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [groupByCode, setGroupByCode] = useState(false);
  const rowSelection = useRowSelection(list.alerts.map((a) => a.id));
  useEffect(() => { rowSelection.clear(); }, [list.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulkAcknowledge = () => acknowledgeIds(Array.from(rowSelection.selected), showToast, list, setBulkBusy, rowSelection.clear);
  // "Todas" es la página actual, no las 2.249 del total sin paginar — el backend
  // rechaza a propósito "todo lo que matchea el filtro" en `/alerts/bulk`
  // (`bulk-update-alerts.ts`) para no reconocer a ciegas algo nunca listado.
  const acknowledgeAllVisible = () => acknowledgeIds(list.alerts.filter((a) => !a.acknowledged).map((a) => a.id), showToast, list, setBulkBusy);
  const selectedAlerts = () => list.alerts.filter((a) => rowSelection.selected.has(a.id));
  return { bulkBusy, rowSelection, bulkAcknowledge, groupByCode, setGroupByCode, selectedAlerts, acknowledgeAllVisible };
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
  return {
    isReadOnlyViewer, canFilterByClient, filters, ...catalogs, ...list,
    ...useUpdateAlert(list), ...useBulkUpdate(list),
  };
}

export type AlertsPageState = ReturnType<typeof useAlertsPage>;
