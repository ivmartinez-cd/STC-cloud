import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { useUrlState, useUrlSearchQuery, enumParam, stringParam, pageParam, type UrlPatch } from '../../../shared/hooks/useUrlState';
import type {
  RemoteActionBatchRow, RemoteActionListResponse, RemoteActionSegment, SortDir,
} from '../types/remoteActions';

const SEGMENTS: RemoteActionSegment[] = ['todos', 'con_errores', 'en_curso', 'cancelados', 'hoy'];
const DIRS: SortDir[] = ['asc', 'desc'];

/** Búsqueda, segmento, orden y página viven en la URL (desde el 12/09/2026 — antes
 * "sin sincronía de URL", deliberado, pero un F5 o volver de otra pantalla perdía
 * el filtro, y el "Diagnosticar" del banner armaba un filtro que no se podía
 * compartir por link). La URL manda: ver `useUrlState`. Defaults omitidos. */
const CODECS = { q: stringParam(), segment: enumParam(SEGMENTS, 'todos'), dir: enumParam(DIRS, 'desc'), page: pageParam };

type UrlFilters = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

/** Chips/búsqueda/orden resetean a la página 1 en el mismo `patch`. */
function useFilterSetters(patch: UrlPatch<UrlFilters>, setRawQuery: (q: string) => void) {
  return useMemo(() => ({
    setSegment: (s: string) => patch({ segment: CODECS.segment.parse(s), page: 0 }),
    clearFilters: () => { setRawQuery(''); patch({ q: '', segment: 'todos', page: 0 }); },
    setPage: (page: number) => patch({ page }),
    /** "Diagnosticar" del banner: búsqueda + segmento en UNA sola escritura de URL. */
    applyFilters: (next: { query?: string; segment: string }) => {
      if (next.query !== undefined) setRawQuery(next.query);
      const q = next.query === undefined ? {} : { q: next.query.trim() };
      patch({ ...q, segment: CODECS.segment.parse(next.segment), page: 0 });
    },
  }), [patch, setRawQuery]);
}

function useDirectoryFilters() {
  const [url, patch] = useUrlState<UrlFilters>(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  const toggleSortDir = useCallback(() => patch({ dir: url.dir === 'desc' ? 'asc' : 'desc', page: 0 }), [patch, url.dir]);
  return {
    rawQuery, setRawQuery, effectiveQuery, segment: url.segment, sortDir: url.dir, toggleSortDir, page: url.page,
    ...useFilterSetters(patch, setRawQuery),
  };
}

type DirectoryFilters = ReturnType<typeof useDirectoryFilters>;

/** Extraída de `useDirectoryRows` para mantener el hook bajo el límite de
 * 20 líneas/función (guía §4) — arma la querystring y pega el fetch. */
async function fetchRemoteActionsPage(
  effectiveQuery: string, segment: RemoteActionSegment, sortDir: SortDir, page: number, pageSize: number
): Promise<RemoteActionListResponse> {
  const params = new URLSearchParams({ dir: sortDir, limit: String(pageSize), offset: String(page * pageSize) });
  if (effectiveQuery) params.set('q', effectiveQuery);
  if (segment !== 'todos') params.set('segment', segment);
  return api.get<RemoteActionListResponse>(`/remote-actions?${params.toString()}`);
}

/** Sólo el `useState` — separado de `useDirectoryRows` por el límite de 20 líneas/función. */
function useRowsState() {
  const [rows, setRows] = useState<RemoteActionBatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { rows, setRows, total, setTotal, loading, setLoading, error, setError };
}

type RowsState = ReturnType<typeof useRowsState>;

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadRows(st: RowsState, f: DirectoryFilters, page: number, pageSize: number, isLatest: () => boolean) {
  st.setLoading(true);
  st.setError('');
  try {
    const data = await fetchRemoteActionsPage(f.effectiveQuery, f.segment, f.sortDir, page, pageSize);
    if (!isLatest()) return;
    st.setRows(data.items ?? []);
    st.setTotal(data.total ?? 0);
  } catch (e: unknown) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useDirectoryRows(filters: DirectoryFilters, pageSize: number) {
  const st = useRowsState();
  const beginRequest = useLatestRequest();
  // `?page=` acotada al mostrar/pedir, sin persistir el clamp (ver `clampPage`).
  const page = clampPage(filters.page, pageSize, st.total);
  const fetchDirectory = useCallback(
    () => loadRows(st, filters, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.effectiveQuery, filters.segment, filters.sortDir, page, pageSize],
  );
  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);
  const totalPages = Math.max(1, Math.ceil(st.total / pageSize));
  return { rows: st.rows, total: st.total, totalPages, page, loading: st.loading, error: st.error, refetch: fetchDirectory };
}

/** Listado paginado/filtrado/ordenado de lotes (handoff hifi "Acciones
 * remotas", 25/08/2026) — mismo patrón que `useClientsDirectory`, con la URL
 * como única fuente de verdad (ver `CODECS`). `pageSize` viene de `useFitRows`
 * en la página: las filas que entran en el alto disponible (27/08/2026 — antes
 * 50 fijas y scroll). */
export function useRemoteActionsDirectory(pageSize: number) {
  const filters = useDirectoryFilters();
  const rows = useDirectoryRows(filters, pageSize);
  const hasActiveFilters = useMemo(
    () => filters.effectiveQuery !== '' || filters.segment !== 'todos',
    [filters.effectiveQuery, filters.segment]
  );
  return { ...filters, pageSize, ...rows, hasActiveFilters };
}

export type RemoteActionsDirectoryState = ReturnType<typeof useRemoteActionsDirectory>;
