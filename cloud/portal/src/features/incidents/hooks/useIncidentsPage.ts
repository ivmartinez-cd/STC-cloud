import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { clampPage } from '../../../shared/lib/clampPage';
import { useUrlState, useUrlSearchQuery, stringParam, flagParam, pageParam, type UrlPatch } from '../../../shared/hooks/useUrlState';
import type { Incident, IncidentListResponse, IncidentStats } from '../../../shared/types/incidents';

export type ClientOption = { id: string; name: string };

export interface IncidentFiltersState {
  q: string; setQ: (v: string) => void;
  openOnly: boolean; setOpenOnly: (v: boolean) => void;
  old24h: boolean; setOld24h: (v: boolean) => void;
  noDevice: boolean; setNoDevice: (v: boolean) => void;
  /** Deep-link (`/incidents?client_id=` desde Cliente Detalle) — se ve y se quita con `ScopeChips`. */
  clientId: string; setClientId: (v: string) => void;
  /** Un solo cambio de URL para los 4 filtros (no 4 escrituras). */
  clearFilters: () => void;
}

/** Filtros y página en la URL (auditoría 12/09/2026: era el único listado que no
 * persistía ni la página — volver de un detalle reseteaba todo). */
const CODECS = { q: stringParam(), open: flagParam(), old24h: flagParam(), no_device: flagParam(), client_id: stringParam(), page: pageParam };
type UrlFilters = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

function useFilterSetters(patch: UrlPatch<UrlFilters>, setRawQuery: (q: string) => void) {
  return useMemo(() => ({
    setOpenOnly: (v: boolean) => patch({ open: v, page: 0 }),
    setOld24h: (v: boolean) => patch({ old24h: v, page: 0 }),
    setNoDevice: (v: boolean) => patch({ no_device: v, page: 0 }),
    setPage: (page: number) => patch({ page }),
    // Filtro de alcance que llega por deep-link: se quita desde `ScopeChips`.
    setClientId: (v: string) => patch({ client_id: v, page: 0 }),
    clearFilters: () => { setRawQuery(''); patch({ q: '', open: false, old24h: false, no_device: false, page: 0 }); },
  }), [patch, setRawQuery]);
}

type IncidentFilters = IncidentFiltersState & { effectiveQuery: string; page: number; setPage: (page: number) => void };

function useIncidentFilters(): IncidentFilters {
  const [url, patch] = useUrlState<UrlFilters>(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  return {
    q: rawQuery, setQ: setRawQuery, effectiveQuery,
    openOnly: url.open, old24h: url.old24h, noDevice: url.no_device, clientId: url.client_id, page: url.page,
    ...useFilterSetters(patch, setRawQuery),
  };
}

export function buildIncidentsQueryParams(f: IncidentFiltersState, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim().length >= 2) params.set('q', f.q.trim());
  if (f.openOnly) params.set('status', 'open');
  if (f.old24h) params.set('min_age_hours', '24');
  if (f.noDevice) params.set('no_device', 'true');
  if (f.clientId) params.set('client_id', f.clientId);
  params.set('order', 'aging_desc');
  params.set('limit', String(pageSize));
  params.set('offset', String(page * pageSize));
  return params;
}

function useClassLabels() {
  const [classLabels, setClassLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    api.get<{ classes: Array<{ id: string; label: string }> }>('/alerts/classes')
      .then((d) => setClassLabels(Object.fromEntries(d.classes.map((c) => [c.id, c.label]))))
      .catch(() => { /* comodidad: se ve la clase sin etiqueta */ });
  }, []);
  return classLabels;
}

function useClients(canManage: boolean) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => {
    if (!canManage) return;
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad: modal sin selector de cliente */ });
  }, [canManage]);
  return clients;
}

function useStats(clientId: string) {
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = clientId ? `?client_id=${clientId}` : '';
    try { setStats(await api.get<IncidentStats>(`/incidents/stats${params}`)); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { void fetchStats(); }, [fetchStats]);
  return { stats, statsLoading: loading, statsError: error, fetchStats };
}

/** Sólo el `useState` — separado de `useRows` por el límite de 20 líneas/función. */
function useRowsState() {
  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { items, setItems, total, setTotal, loading, setLoading, error, setError };
}

function requestIncidentPage(filters: IncidentFiltersState, page: number, pageSize: number): Promise<IncidentListResponse> {
  const qs = buildIncidentsQueryParams(filters, page, pageSize).toString();
  return api.get<IncidentListResponse>(`/incidents?${qs}`);
}

type RowsState = ReturnType<typeof useRowsState>;

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadIncidentPage(st: RowsState, filters: IncidentFiltersState, page: number, pageSize: number, isLatest: () => boolean) {
  if (!st.items.length) st.setLoading(true);
  st.setError('');
  try {
    const data = await requestIncidentPage(filters, page, pageSize);
    if (!isLatest()) return;
    st.setItems(data.items);
    st.setTotal(data.total);
  } catch (e) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useRows(filters: IncidentFilters, pageSize: number) {
  const st = useRowsState();
  const beginRequest = useLatestRequest();
  // `?page=` acotada al mostrar/pedir, sin persistir el clamp (ver `clampPage`).
  const page = clampPage(filters.page, pageSize, st.total);
  const fetchIncidents = useCallback(
    () => loadIncidentPage(st, { ...filters, q: filters.effectiveQuery }, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.effectiveQuery, filters.openOnly, filters.old24h, filters.noDevice, filters.clientId, page, pageSize],
  );
  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);
  return { ...st, page, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchIncidents };
}

function useList(filters: IncidentFilters, pageSize: number) {
  return { setPage: filters.setPage, ...useRows(filters, pageSize) };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). */
export function useIncidentsPage(pageSize: number) {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'operator';
  const filters = useIncidentFilters();
  const clients = useClients(canManage);
  const classLabels = useClassLabels();
  const list = useList(filters, pageSize);
  return { canManage, filters, clients, classLabels, ...list, ...useStats(filters.clientId) };
}

export type IncidentsPageState = ReturnType<typeof useIncidentsPage>;
