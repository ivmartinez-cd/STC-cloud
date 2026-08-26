import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import type {
  AgentDirectoryResponse, AgentDirectoryRow, AgentFleetSummary, AgentSegment, AgentSignalBucketsResponse, SortDir,
} from '../types/agentsDirectory';

/** Mismo criterio que `/clients`/`/devices` (ver `useClientsDirectory.ts`): techo/página establecidos para el resto de tablas paginadas del portal. */
export const PAGE_SIZE = 50;

const SEGMENTS: AgentSegment[] = ['todos', 'sin_senal', 'desactualizados', 'llave_por_vencer'];

function parseSegment(v: string | null): AgentSegment {
  return v && (SEGMENTS as string[]).includes(v) ? (v as AgentSegment) : 'todos';
}
function parseSortDir(v: string | null): SortDir {
  return v === 'asc' ? 'asc' : 'desc';
}
function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Filtro/orden/página reflejados en la URL (mismo criterio que `/clients`) — valores por defecto se omiten para no ensuciarla. */
function useUrlSync(q: string, segment: AgentSegment, sortDir: SortDir, page: number) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (q) next.set('q', q); else next.delete('q');
    if (segment !== 'todos') next.set('segment', segment); else next.delete('segment');
    if (sortDir !== 'desc') next.set('dir', sortDir); else next.delete('dir');
    if (page > 0) next.set('page', String(page)); else next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, segment, sortDir, page]);
}

/** Estado de filtro/orden/página. A diferencia de Clientes, acá hay un solo
 * campo ordenable (`última señal`, spec del handoff) — no hace falta un
 * `sortField`, sólo el toggle de dirección. */
function useDirectoryFilters() {
  const [initial] = useSearchParams();
  const [rawQuery, setRawQuery] = useState(initial.get('q') ?? '');
  const [segment, setSegmentState] = useState<AgentSegment>(() => parseSegment(initial.get('segment')));
  const [sortDir, setSortDir] = useState<SortDir>(() => parseSortDir(initial.get('dir')));
  const [page, setPage] = useState(() => parsePage(initial.get('page')));

  const debouncedQuery = useDebounce(rawQuery, 300);
  const effectiveQuery = debouncedQuery.trim().length >= 2 ? debouncedQuery.trim() : '';

  useUrlSync(effectiveQuery, segment, sortDir, page);
  useEffect(() => { setPage(0); }, [effectiveQuery, segment]);

  const setSegment = useCallback((s: AgentSegment) => setSegmentState(s), []);
  const clearFilters = useCallback(() => { setRawQuery(''); setSegmentState('todos'); }, []);
  const toggleSort = useCallback(() => { setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); setPage(0); }, []);

  return { rawQuery, setRawQuery, effectiveQuery, segment, setSegment, clearFilters, sortDir, toggleSort, page, setPage };
}

type DirectoryFilters = ReturnType<typeof useDirectoryFilters>;

/** Página actual del listado — reactiva a filtro/orden/página. */
function useDirectoryRows(filters: DirectoryFilters) {
  const { effectiveQuery, segment, sortDir, page } = filters;
  const [rows, setRows] = useState<AgentDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ dir: sortDir, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (effectiveQuery) params.set('q', effectiveQuery);
    if (segment !== 'todos') params.set('segment', segment);
    try {
      const data = await api.get<AgentDirectoryResponse>(`/agents/directory?${params.toString()}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [effectiveQuery, segment, sortDir, page]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { rows, total, totalPages, loading, error, refetch: fetchDirectory };
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

export function useAgentsDirectory() {
  const filters = useDirectoryFilters();
  return { ...filters, ...useDirectoryRows(filters), ...useFleetSummary(), ...useSignalBuckets() };
}

export type AgentsDirectoryState = ReturnType<typeof useAgentsDirectory>;
