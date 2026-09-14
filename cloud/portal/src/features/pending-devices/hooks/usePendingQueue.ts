import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { enumParam, pageParam, stringParam, useUrlSearchQuery, useUrlState } from '../../../shared/hooks/useUrlState';
import type { ClientOption } from '../../../shared/components/DeviceLifecycleModals/types';
import type { PendingQueueResponse, PendingQueueRow, PendingQueueSegment, PendingQueueSummary, SortDir } from '../types/pendingDevices';

const SEGMENTS: PendingQueueSegment[] = ['todos', 'posibles_duplicados', 'mas_7_dias', 'sin_cliente'];
const DIRS: SortDir[] = ['asc', 'desc'];

/** Filtro/cliente/orden/página viven en la URL — mismo criterio que
 * `useDeviceDirectory` (la URL manda, ver `useUrlState`). `client_id` llega
 * prellenado desde los links `/pending?client_id=…` (Cliente — Detalle) pero queda
 * editable: es un FILTRO opcional acá, no un gate (bug arreglado del handoff —
 * antes la pantalla exigía elegir cliente para mostrar cualquier fila). */
const CODECS = {
  q: stringParam(),
  client_id: stringParam(),
  segment: enumParam(SEGMENTS, 'todos'),
  dir: enumParam(DIRS, 'desc'),
  page: pageParam,
};

/** Estado de filtro/cliente/orden/página, derivado de la URL. Buscador/cliente/
 * segmento resetean a la página 1 en el mismo `patch` — evita quedar en una
 * página vacía. */
function useFilters() {
  const [url, patch] = useUrlState(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  const setClientId = useCallback((client_id: string) => patch({ client_id, page: 0 }), [patch]);
  const setSegment = useCallback((segment: PendingQueueSegment) => patch({ segment, page: 0 }), [patch]);
  const clearFilters = useCallback(() => { setRawQuery(''); patch({ q: '', client_id: '', segment: 'todos', page: 0 }); }, [patch, setRawQuery]);
  const toggleSort = useCallback(() => patch({ dir: url.dir === 'desc' ? 'asc' : 'desc' }), [patch, url.dir]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);
  return {
    rawQuery, setRawQuery, effectiveQuery, clientId: url.client_id, setClientId,
    segment: url.segment, setSegment, clearFilters, sortDir: url.dir, toggleSort, page: url.page, setPage,
  };
}

type Filters = ReturnType<typeof useFilters>;

/** EN ESPERA desc (más días esperando primero, default del handoff) equivale a
 * `created_at` ASC (más antiguo primero) en el backend — inverso, porque
 * "esperar más" y "haber sido creado antes" son la misma cosa mirada al revés. */
function apiDirFor(sortDir: SortDir): SortDir { return sortDir === 'desc' ? 'asc' : 'desc'; }

function queueParams(filters: Filters, page: number, pageSize: number): URLSearchParams {
  const { effectiveQuery, clientId, segment, sortDir } = filters;
  const params = new URLSearchParams({ dir: apiDirFor(sortDir), limit: String(pageSize), offset: String(page * pageSize) });
  if (effectiveQuery) params.set('q', effectiveQuery);
  if (clientId) params.set('client_id', clientId);
  if (segment !== 'todos') params.set('segment', segment);
  return params;
}

function fetchQueuePage(filters: Filters, page: number, pageSize: number): Promise<PendingQueueResponse> {
  return api.get<PendingQueueResponse>(`/devices/pending/directory?${queueParams(filters, page, pageSize).toString()}`);
}

function useRowsState() {
  const [rows, setRows] = useState<PendingQueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { rows, setRows, total, setTotal, loading, setLoading, error, setError };
}

type RowsState = ReturnType<typeof useRowsState>;

/** Cuerpo de la carga, separado de `useRows` para no cruzar el límite de 20
 * líneas/función de la guía. `isLatest` descarta respuestas de requests viejos. */
async function loadRows(st: RowsState, filters: Filters, page: number, pageSize: number, isLatest: () => boolean) {
  if (!st.rows.length) st.setLoading(true);
  st.setError('');
  try {
    const data = await fetchQueuePage(filters, page, pageSize);
    if (!isLatest()) return;
    st.setRows(data.rows ?? []);
    st.setTotal(data.total ?? 0);
  } catch (e: unknown) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

/** Página actual — reactiva a filtro/cliente/segmento/orden/página. */
function useRows(filters: Filters, pageSize: number) {
  const { effectiveQuery, clientId, segment, sortDir } = filters;
  const st = useRowsState();
  const page = clampPage(filters.page, pageSize, st.total);
  const beginRequest = useLatestRequest();
  const fetchRows = useCallback(
    () => loadRows(st, filters, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beginRequest, effectiveQuery, clientId, segment, sortDir, page, pageSize],
  );
  useEffect(() => { void fetchRows(); }, [fetchRows]);
  const totalPages = Math.max(1, Math.ceil(st.total / pageSize));
  return { ...st, totalPages, page, refetch: fetchRows };
}

/** Tira de métricas — endpoint aparte, loading/error independientes de la tabla. */
function useSummary() {
  const [summary, setSummary] = useState<PendingQueueSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      setSummary(await api.get<PendingQueueSummary>('/devices/pending/summary'));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, refetchSummary: fetchSummary };
}

function useClientOptions() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => { api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([])); }, []);
  return clients;
}

/** `pageSize` viene de `useFitRows` en la página: las filas que entran en el
 * alto disponible (27/08/2026 — antes 50 fijas y scroll). */
export function usePendingQueue(pageSize: number) {
  const filters = useFilters();
  const rows = useRows(filters, pageSize);
  return { ...filters, pageSize, ...rows, ...useSummary(), clients: useClientOptions() };
}

export type PendingQueueState = ReturnType<typeof usePendingQueue>;
