import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { clampPage } from '../../../shared/lib/clampPage';
import {
  useUrlState, useUrlSearchQuery, stringParam, flagParam, enumParam, pageParam, type UrlCodec, type UrlPatch,
} from '../../../shared/hooks/useUrlState';
import { ALERT_CLASS_IDS, type Alert, type AlertSummary } from '../../../shared/types/alerts';

export type ClientOption = { id: string; name: string };
export type AlertPatch = { acknowledged?: boolean; resolved?: boolean };

export interface AlertFiltersState {
  q: string; setQ: (v: string) => void;
  unresolved: boolean; setUnresolved: (v: boolean) => void;
  critical: boolean; setCritical: (v: boolean) => void;
  unacknowledged: boolean; setUnacknowledged: (v: boolean) => void;
  /** Chip DISPONIBILIDAD = `alertClass === 'availability'`. */
  availability: boolean; setAvailability: (v: boolean) => void;
  last24h: boolean; setLast24h: (v: boolean) => void;
  /** `?class=` — el panel "por clase" del dashboard manda cualquier clase, no sólo
   * availability (antes las demás se ignoraban en silencio). */
  alertClass: string; setAlertClass: (v: string) => void;
  /** Deep-link (`/alerts?client_id=` desde Cliente Detalle) — se ve y se quita con `ScopeChips`. */
  clientId: string; setClientId: (v: string) => void;
  /** Deep-link ("Ver todas →" de la ficha de equipo). */
  deviceId: string; setDeviceId: (v: string) => void;
}

/** Ausente → sólo sin resolver (default); `?resolved=` vacío → todas. Compatible con
 * el `?resolved=false` que mandan el dashboard y Cliente Detalle. */
const resolvedParam: UrlCodec<boolean> = { parse: (raw) => raw !== '', format: (unresolved) => (unresolved ? null : '') };

/** Todo el filtro y la página viven en la URL (auditoría 12/09/2026: antes sólo
 * `resolved`/`class`, y se perdían chips y página al volver de un incidente). */
const CODECS = {
  q: stringParam(), resolved: resolvedParam, critical: flagParam(), unack: flagParam(),
  // Validada contra el catálogo: `GET /alerts` da 400 ante una clase desconocida.
  class: enumParam<string>([...ALERT_CLASS_IDS], ''),
  last24h: flagParam(), client_id: stringParam(), device_id: stringParam(), page: pageParam,
};
type UrlFilters = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

function useFilterSetters(patch: UrlPatch<UrlFilters>) {
  return useMemo(() => ({
    setUnresolved: (v: boolean) => patch({ resolved: v, page: 0 }),
    setCritical: (v: boolean) => patch({ critical: v, page: 0 }),
    setUnacknowledged: (v: boolean) => patch({ unack: v, page: 0 }),
    setAvailability: (v: boolean) => patch({ class: v ? 'availability' : '', page: 0 }),
    setLast24h: (v: boolean) => patch({ last24h: v, page: 0 }),
    setPage: (page: number) => patch({ page }),
    // Filtros de alcance que llegan por deep-link: se quitan desde `ScopeChips`.
    setAlertClass: (v: string) => patch({ class: v, page: 0 }),
    setClientId: (v: string) => patch({ client_id: v, page: 0 }),
    setDeviceId: (v: string) => patch({ device_id: v, page: 0 }),
  }), [patch]);
}

type AlertFilters = AlertFiltersState & { effectiveQuery: string; page: number; setPage: (page: number) => void };

/**
 * Alcance FIJO, fuera de la URL: la pestaña "Alertas" de la ficha de cliente
 * lista sólo las de ese cliente, y el operador no puede quitarlo (no es un
 * chip, es la pestaña). El `?client_id=` de la URL se ignora en ese modo.
 */
export interface AlertsScope { clientId: string }

function useAlertFilters(scope?: AlertsScope): AlertFilters {
  const [url, patch] = useUrlState<UrlFilters>(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  const setters = useFilterSetters(patch);
  return {
    q: rawQuery, setQ: setRawQuery, effectiveQuery,
    unresolved: url.resolved, critical: url.critical, unacknowledged: url.unack, last24h: url.last24h,
    availability: url.class === 'availability', alertClass: url.class,
    clientId: scope?.clientId ?? url.client_id, deviceId: url.device_id, page: url.page,
    ...setters,
    ...(scope ? { setClientId: () => undefined } : {}),
  };
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

export function buildAlertsQueryParams(f: AlertFiltersState, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim().length >= 2) params.set('q', f.q.trim());
  if (f.unresolved) params.set('resolved', 'false');
  if (f.critical) params.set('severity', 'critical');
  if (f.unacknowledged) params.set('acknowledged', 'false');
  if (f.alertClass) params.set('alert_class', f.alertClass);
  if (f.last24h) params.set('max_age_hours', '24');
  if (f.clientId) params.set('client_id', f.clientId);
  if (f.deviceId) params.set('device_id', f.deviceId);
  params.set('limit', String(pageSize));
  params.set('offset', String(page * pageSize));
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
async function requestAlertPage(filters: AlertFiltersState, page: number, pageSize: number): Promise<{ items: Alert[]; total: number }> {
  const qs = buildAlertsQueryParams(filters, page, pageSize).toString();
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

type AlertRowsState = ReturnType<typeof useAlertRowsState>;

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadAlertPage(st: AlertRowsState, filters: AlertFiltersState, page: number, pageSize: number, isLatest: () => boolean) {
  if (!st.alerts.length) st.setLoading(true);
  st.setError('');
  try {
    const { items, total } = await requestAlertPage(filters, page, pageSize);
    if (!isLatest()) return;
    st.setAlerts(items);
    st.setTotal(total);
  } catch (e) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useAlertRows(filters: AlertFilters, pageSize: number) {
  const st = useAlertRowsState();
  const beginRequest = useLatestRequest();
  // `?page=` acotada al mostrar/pedir, sin persistir el clamp (ver `clampPage`).
  const page = clampPage(filters.page, pageSize, st.total);
  const fetchAlerts = useCallback(
    () => loadAlertPage(st, { ...filters, q: filters.effectiveQuery }, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.effectiveQuery, filters.unresolved, filters.critical, filters.unacknowledged, filters.alertClass, filters.last24h, filters.clientId, filters.deviceId, page, pageSize],
  );
  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);
  return { ...st, page, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchAlerts };
}

function useAlertList(filters: AlertFilters, pageSize: number) {
  const rows = useAlertRows(filters, pageSize);
  return { setPage: filters.setPage, ...rows, ...useAlertSummary(filters.unresolved, filters.clientId) };
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
  const rowSelection = useRowSelection(list.alerts.map((a) => a.id));
  useEffect(() => { rowSelection.clear(); }, [list.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulkAcknowledge = () => acknowledgeIds(Array.from(rowSelection.selected), showToast, list, setBulkBusy, rowSelection.clear);
  // "Todas" es la página actual, no las 2.249 del total sin paginar — el backend
  // rechaza a propósito "todo lo que matchea el filtro" en `/alerts/bulk`
  // (`bulk-update-alerts.ts`) para no reconocer a ciegas algo nunca listado.
  const acknowledgeAllVisible = () => acknowledgeIds(list.alerts.filter((a) => !a.acknowledged).map((a) => a.id), showToast, list, setBulkBusy);
  const selectedAlerts = () => list.alerts.filter((a) => rowSelection.selected.has(a.id));
  return { bulkBusy, rowSelection, bulkAcknowledge, selectedAlerts, acknowledgeAllVisible };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). El
 * toggle "agrupar por código" vive en la página, no acá: `useFitRows` necesita
 * saberlo ANTES de calcular `pageSize` (descuenta las cabeceras de grupo). */
export function useAlertsPage(pageSize: number, scope?: AlertsScope) {
  const { role } = useAuth();
  // client_viewer ve /alerts pero no reconoce/resuelve (PUT /alerts/:id no está
  // en CLIENT_VIEWER_ROUTES): se ocultan los botones, mismo criterio que MonitorDetail.
  const isReadOnlyViewer = role === 'client_viewer';
  const canFilterByClient = role === 'admin' || role === 'operator';
  const filters = useAlertFilters(scope);
  const catalogs = useAlertCatalogs(canFilterByClient);
  const list = useAlertList(filters, pageSize);
  return {
    isReadOnlyViewer, canFilterByClient, filters, ...catalogs, ...list,
    ...useUpdateAlert(list), ...useBulkUpdate(list),
  };
}

export type AlertsPageState = ReturnType<typeof useAlertsPage>;
