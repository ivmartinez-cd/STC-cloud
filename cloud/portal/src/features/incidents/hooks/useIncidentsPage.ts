import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import type { Incident, IncidentListResponse, IncidentStats } from '../../../shared/types/incidents';

export type ClientOption = { id: string; name: string };

export interface IncidentFiltersState {
  q: string; setQ: (v: string) => void;
  openOnly: boolean; setOpenOnly: (v: boolean) => void;
  old24h: boolean; setOld24h: (v: boolean) => void;
  noDevice: boolean; setNoDevice: (v: boolean) => void;
  /** Deep-link únicamente (`/incidents?client_id=` desde Cliente Detalle) — sin chip propio. */
  clientId: string;
}

function useIncidentFilters(): IncidentFiltersState {
  const [initial] = useSearchParams();
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [old24h, setOld24h] = useState(false);
  const [noDevice, setNoDevice] = useState(false);
  const [clientId] = useState(() => initial.get('client_id') ?? '');
  return { q, setQ, openOnly, setOpenOnly, old24h, setOld24h, noDevice, setNoDevice, clientId };
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

function useRows(filters: IncidentFiltersState, page: number, debouncedQ: string, pageSize: number) {
  const st = useRowsState();
  const effective = { ...filters, q: debouncedQ };
  const fetchIncidents = useCallback(async () => {
    st.setLoading(true);
    st.setError('');
    try {
      const data = await requestIncidentPage(effective, page, pageSize);
      st.setItems(data.items);
      st.setTotal(data.total);
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.openOnly, filters.old24h, filters.noDevice, filters.clientId, page, pageSize]);
  useEffect(() => { void fetchIncidents(); }, [fetchIncidents]);
  return { ...st, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchIncidents };
}

function useList(filters: IncidentFiltersState, pageSize: number) {
  const [page, setPage] = useState(0);
  const debouncedQ = useDebounce(filters.q, 300);
  useEffect(() => { setPage(0); }, [debouncedQ, filters.openOnly, filters.old24h, filters.noDevice, filters.clientId]);
  usePageSizeReset(pageSize, setPage);
  return { page, setPage, ...useRows(filters, page, debouncedQ, pageSize) };
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
