import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { enumParam, pageParam, stringParam, useUrlSearchQuery, useUrlState } from '../../../shared/hooks/useUrlState';
import type {
  AgentDirectoryResponse, AgentDirectoryRow, AgentFleetSummary, AgentSegment, AgentSignalBucketsResponse, SortDir,
} from '../types/agentsDirectory';

const SEGMENTS: AgentSegment[] = ['todos', 'sin_senal', 'desactualizados', 'llave_por_vencer'];
const DIRS: SortDir[] = ['asc', 'desc'];

/** Filtro/orden/página viven en la URL (mismo criterio que `/clients`) — los valores
 * por defecto se omiten para no ensuciarla. La URL manda (ver `useUrlState`). */
const CODECS = {
  q: stringParam(),
  segment: enumParam(SEGMENTS, 'todos'),
  dir: enumParam(DIRS, 'desc'),
  page: pageParam,
};

/** Estado de filtro/orden/página, derivado de la URL. A diferencia de Clientes,
 * acá hay un solo campo ordenable (`última señal`, spec del handoff) — no hace
 * falta un `sortField`, sólo el toggle de dirección. Chips/búsqueda/orden resetean
 * a la página 1 en el mismo `patch`. */
function useDirectoryFilters() {
  const [url, patch] = useUrlState(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));

  const setSegment = useCallback((segment: AgentSegment) => patch({ segment, page: 0 }), [patch]);
  const clearFilters = useCallback(() => { setRawQuery(''); patch({ q: '', segment: 'todos', page: 0 }); }, [patch, setRawQuery]);
  const toggleSort = useCallback(() => patch({ dir: url.dir === 'desc' ? 'asc' : 'desc', page: 0 }), [patch, url.dir]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);

  return {
    rawQuery, setRawQuery, effectiveQuery, segment: url.segment, setSegment, clearFilters,
    sortDir: url.dir, toggleSort, page: url.page, setPage,
  };
}

type DirectoryFilters = ReturnType<typeof useDirectoryFilters>;

/** Página actual del listado — reactiva a filtro/orden/página. */
function useDirectoryRows(filters: DirectoryFilters, pageSize: number) {
  const { effectiveQuery, segment, sortDir } = filters;
  const [rows, setRows] = useState<AgentDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const page = clampPage(filters.page, pageSize, total);
  const beginRequest = useLatestRequest();

  const fetchDirectory = useCallback(async () => {
    const isLatest = beginRequest();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ dir: sortDir, limit: String(pageSize), offset: String(page * pageSize) });
    if (effectiveQuery) params.set('q', effectiveQuery);
    if (segment !== 'todos') params.set('segment', segment);
    try {
      const data = await api.get<AgentDirectoryResponse>(`/agents/directory?${params.toString()}`);
      if (!isLatest()) return;
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      if (isLatest()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [beginRequest, effectiveQuery, segment, sortDir, page, pageSize]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, totalPages, page, loading, error, refetch: fetchDirectory };
}

/** Tira de 4 métricas de flota — endpoint aparte, loading/error independiente de la tabla. */
function useFleetSummary() {
  const [summary, setSummary] = useState<AgentFleetSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      setSummary(await api.get<AgentFleetSummary>('/agents/summary'));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, refetchSummary: fetchSummary };
}

/** Distribución por antigüedad de señal (4 buckets) — endpoint aparte también. */
function useSignalBuckets() {
  const [buckets, setBuckets] = useState<AgentSignalBucketsResponse | null>(null);
  const [bucketsLoading, setBucketsLoading] = useState(true);
  const [bucketsError, setBucketsError] = useState(false);

  const fetchBuckets = useCallback(async () => {
    setBucketsLoading(true);
    setBucketsError(false);
    try {
      setBuckets(await api.get<AgentSignalBucketsResponse>('/agents/signal-buckets'));
    } catch {
      setBuckets(null);
      setBucketsError(true);
    } finally {
      setBucketsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchBuckets(); }, [fetchBuckets]);
  return { buckets, bucketsLoading, bucketsError, refetchBuckets: fetchBuckets };
}

/** `pageSize` viene de `useFitRows` en la página: las filas que entran en el
 * alto disponible (27/08/2026 — antes 50 fijas y scroll). */
export function useAgentsDirectory(pageSize: number) {
  const filters = useDirectoryFilters();
  const rows = useDirectoryRows(filters, pageSize);
  return { ...filters, pageSize, ...rows, ...useFleetSummary(), ...useSignalBuckets() };
}

export type AgentsDirectoryState = ReturnType<typeof useAgentsDirectory>;
