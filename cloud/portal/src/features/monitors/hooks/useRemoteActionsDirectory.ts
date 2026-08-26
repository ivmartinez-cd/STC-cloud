import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import type {
  RemoteActionBatchRow, RemoteActionListResponse, RemoteActionSegment, SortDir,
} from '../types/remoteActions';

/** Listado paginado/filtrado/ordenado de lotes (handoff hifi "Acciones
 * remotas", 25/08/2026) — mismo patrón que `useClientsDirectory`, sin
 * sincronía de URL (esta pantalla no tiene deep-link propio en el handoff,
 * a diferencia de Clientes/Equipos). */
export const REMOTE_ACTIONS_PAGE_SIZE = 50;

const SEGMENTS: RemoteActionSegment[] = ['todos', 'con_errores', 'en_curso', 'cancelados', 'hoy'];

function parseSegment(v: string): RemoteActionSegment {
  return (SEGMENTS as string[]).includes(v) ? (v as RemoteActionSegment) : 'todos';
}

function useDirectoryFilters() {
  const [rawQuery, setRawQuery] = useState('');
  const [segment, setSegmentState] = useState<RemoteActionSegment>('todos');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const debouncedQuery = useDebounce(rawQuery, 300);
  const effectiveQuery = debouncedQuery.trim().length >= 2 ? debouncedQuery.trim() : '';

  useEffect(() => { setPage(0); }, [effectiveQuery, segment]);

  const setSegment = useCallback((s: string) => setSegmentState(parseSegment(s)), []);
  const clearFilters = useCallback(() => { setRawQuery(''); setSegmentState('todos'); }, []);
  const toggleSortDir = useCallback(() => { setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); setPage(0); }, []);

  return { rawQuery, setRawQuery, effectiveQuery, segment, setSegment, clearFilters, sortDir, toggleSortDir, page, setPage };
}

type DirectoryFilters = ReturnType<typeof useDirectoryFilters>;

/** Extraída de `useDirectoryRows` para mantener el hook bajo el límite de
 * 20 líneas/función (guía §4) — arma la querystring y pega el fetch. */
async function fetchRemoteActionsPage(
  effectiveQuery: string, segment: RemoteActionSegment, sortDir: SortDir, page: number
): Promise<RemoteActionListResponse> {
  const params = new URLSearchParams({ dir: sortDir, limit: String(REMOTE_ACTIONS_PAGE_SIZE), offset: String(page * REMOTE_ACTIONS_PAGE_SIZE) });
  if (effectiveQuery) params.set('q', effectiveQuery);
  if (segment !== 'todos') params.set('segment', segment);
  return api.get<RemoteActionListResponse>(`/remote-actions?${params.toString()}`);
}

function useDirectoryRows(filters: DirectoryFilters) {
  const { effectiveQuery, segment, sortDir, page } = filters;
  const [rows, setRows] = useState<RemoteActionBatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fetchDirectory = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await fetchRemoteActionsPage(effectiveQuery, segment, sortDir, page);
      setRows(data.items ?? []); setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [effectiveQuery, segment, sortDir, page]);
  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);
  const totalPages = Math.max(1, Math.ceil(total / REMOTE_ACTIONS_PAGE_SIZE));
  return { rows, total, totalPages, loading, error, refetch: fetchDirectory };
}

export function useRemoteActionsDirectory() {
  const filters = useDirectoryFilters();
  const rows = useDirectoryRows(filters);
  const hasActiveFilters = useMemo(
    () => filters.effectiveQuery !== '' || filters.segment !== 'todos',
    [filters.effectiveQuery, filters.segment]
  );
  return { ...filters, ...rows, hasActiveFilters };
}

export type RemoteActionsDirectoryState = ReturnType<typeof useRemoteActionsDirectory>;
