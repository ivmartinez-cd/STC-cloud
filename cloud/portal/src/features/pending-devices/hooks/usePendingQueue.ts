import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import type { ClientOption } from '../../../shared/components/DeviceLifecycleModals/types';
import type { PendingQueueResponse, PendingQueueRow, PendingQueueSegment, PendingQueueSummary, SortDir } from '../types/pendingDevices';

const SEGMENTS: PendingQueueSegment[] = ['todos', 'posibles_duplicados', 'mas_7_dias', 'sin_cliente'];

function parseSegment(v: string | null): PendingQueueSegment {
  return v && (SEGMENTS as string[]).includes(v) ? (v as PendingQueueSegment) : 'todos';
}
function parseSortDir(v: string | null): SortDir { return v === 'asc' ? 'asc' : 'desc'; }
function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Filtro/cliente/orden/página reflejados en la URL — mismo criterio que
 * `useDeviceDirectory`. `client_id` llega prellenado desde los links
 * `/pending?client_id=…` (Cliente — Detalle) pero queda editable: es un FILTRO
 * opcional acá, no un gate (bug arreglado del handoff — antes la pantalla
 * exigía elegir cliente para mostrar cualquier fila). */
function useUrlSync(q: string, clientId: string, segment: PendingQueueSegment, sortDir: SortDir, page: number) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (q) next.set('q', q); else next.delete('q');
    if (clientId) next.set('client_id', clientId); else next.delete('client_id');
    if (segment !== 'todos') next.set('segment', segment); else next.delete('segment');
    if (sortDir !== 'desc') next.set('dir', sortDir); else next.delete('dir');
    if (page > 0) next.set('page', String(page)); else next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, clientId, segment, sortDir, page]);
}

function useFilterState() {
  const [initial] = useSearchParams();
  const [rawQuery, setRawQuery] = useState(initial.get('q') ?? '');
  const [clientId, setClientId] = useState(initial.get('client_id') ?? '');
  const [segment, setSegmentState] = useState<PendingQueueSegment>(() => parseSegment(initial.get('segment')));
  const [sortDir, setSortDir] = useState<SortDir>(() => parseSortDir(initial.get('dir')));
  const [page, setPage] = useState(() => parsePage(initial.get('page')));
  return { rawQuery, setRawQuery, clientId, setClientId, segment, setSegmentState, sortDir, setSortDir, page, setPage };
}

/** Estado de filtro/cliente/orden/página, sincronizado con la URL — mismo
 * patrón de separación `useXState`/`useX` que `useDeviceDirectory` (así
 * ninguna de las 2 funciones cruza el límite de 20 líneas). */
function useFilters() {
  const s = useFilterState();
  const debouncedQuery = useDebounce(s.rawQuery, 300);
  const effectiveQuery = debouncedQuery.trim().length >= 2 ? debouncedQuery.trim() : '';
  useUrlSync(effectiveQuery, s.clientId, s.segment, s.sortDir, s.page);
  // Buscador/cliente/segmento resetean a la página 1 — evita quedar en una página vacía.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { s.setPage(0); }, [effectiveQuery, s.clientId, s.segment]);
  return {
    ...s, effectiveQuery,
    setSegment: s.setSegmentState,
    clearFilters: () => { s.setRawQuery(''); s.setClientId(''); s.setSegmentState('todos'); },
    toggleSort: () => s.setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')),
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
 * líneas/función de la guía. */
async function loadRows(st: RowsState, filters: Filters, page: number, pageSize: number) {
  st.setLoading(true);
  st.setError('');
  try {
    const data = await fetchQueuePage(filters, page, pageSize);
    st.setRows(data.rows ?? []);
    st.setTotal(data.total ?? 0);
  } catch (e: unknown) {
    st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    st.setLoading(false);
  }
}

/** Página actual — reactiva a filtro/cliente/segmento/orden/página. */
function useRows(filters: Filters, pageSize: number) {
  const { effectiveQuery, clientId, segment, sortDir, page } = filters;
  const st = useRowsState();
  const fetchRows = useCallback(
    () => loadRows(st, filters, page, pageSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveQuery, clientId, segment, sortDir, page, pageSize],
  );
  useEffect(() => { void fetchRows(); }, [fetchRows]);
  const totalPages = Math.max(1, Math.ceil(st.total / pageSize));
  return { ...st, totalPages, refetch: fetchRows };
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
  usePageSizeReset(pageSize, filters.setPage);
  return { ...filters, pageSize, ...useRows(filters, pageSize), ...useSummary(), clients: useClientOptions() };
}

export type PendingQueueState = ReturnType<typeof usePendingQueue>;
