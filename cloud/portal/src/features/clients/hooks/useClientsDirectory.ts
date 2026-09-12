import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { enumParam, pageParam, stringParam, useUrlSearchQuery, useUrlState } from '../../../shared/hooks/useUrlState';
import type {
  ClientDirectoryResponse, ClientDirectoryRow, ClientPortfolioSummary, ClientSegment, ClientSortField, SortDir,
} from '../types/clientsDirectory';

const SEGMENTS: ClientSegment[] = ['todos', 'sin_contacto', 'con_alertas', 'sin_reporte_24h'];
const SORT_FIELDS: ClientSortField[] = ['monitor_count', 'device_count', 'alerts_count', 'last_report_at'];
const DIRS: SortDir[] = ['asc', 'desc'];

/** Filtro/orden/página viven en la URL (README: "para poder compartir la vista");
 * los valores por defecto se omiten para no ensuciarla. La URL manda: si cambia
 * desde afuera (sidebar, atrás/adelante) la tabla la sigue — ver `useUrlState`. */
const CODECS = {
  q: stringParam(),
  segment: enumParam(SEGMENTS, 'todos'),
  sort: enumParam(SORT_FIELDS, 'device_count'),
  dir: enumParam(DIRS, 'desc'),
  page: pageParam,
};

/** Estado de filtro/orden/página, derivado de la URL en cada render. Chips,
 * búsqueda y orden resetean a la página 1 en el mismo `patch` (README) — evita
 * quedar en una página vacía y dispara UN solo fetch. */
function useDirectoryFilters() {
  const [url, patch] = useUrlState(CODECS);
  // Mínimo 2 caracteres (README, "Buscador"): por debajo de eso no se manda `q`.
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));

  const setSegment = useCallback((segment: ClientSegment) => patch({ segment, page: 0 }), [patch]);
  const clearFilters = useCallback(() => { setRawQuery(''); patch({ q: '', segment: 'todos', page: 0 }); }, [patch, setRawQuery]);
  const toggleSort = useCallback((field: ClientSortField) => {
    const dir: SortDir = url.sort === field && url.dir === 'desc' ? 'asc' : 'desc';
    patch({ sort: field, dir, page: 0 });
  }, [patch, url.sort, url.dir]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);

  return {
    rawQuery, setRawQuery, effectiveQuery, segment: url.segment, setSegment, clearFilters,
    sortField: url.sort, sortDir: url.dir, toggleSort, page: url.page, setPage,
  };
}

type DirectoryFilters = ReturnType<typeof useDirectoryFilters>;

/** Página actual del listado — reactiva a filtro/orden/página. */
function useDirectoryRows(filters: DirectoryFilters, pageSize: number) {
  const { effectiveQuery, segment, sortField, sortDir } = filters;
  const [rows, setRows] = useState<ClientDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const page = clampPage(filters.page, pageSize, total);
  const beginRequest = useLatestRequest();

  const fetchDirectory = useCallback(async () => {
    const isLatest = beginRequest();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ sort: sortField, dir: sortDir, limit: String(pageSize), offset: String(page * pageSize) });
    if (effectiveQuery) params.set('q', effectiveQuery);
    if (segment !== 'todos') params.set('segment', segment);
    try {
      const data = await api.get<ClientDirectoryResponse>(`/clients/directory?${params.toString()}`);
      if (!isLatest()) return;
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      if (isLatest()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [beginRequest, effectiveQuery, segment, sortField, sortDir, page, pageSize]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  // Las barras de "Equipos" se escalan sobre el máximo de la PÁGINA visible, no el
  // global (README: "evita barras invisibles al paginar").
  const maxDeviceCountOnPage = useMemo(() => rows.reduce((max, r) => Math.max(max, r.device_count), 0), [rows]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { rows, total, totalPages, page, loading, error, refetch: fetchDirectory, maxDeviceCountOnPage };
}

/** Tira de métricas de cartera — endpoint aparte, loading/error independientes de la tabla. */
function useDirectorySummary() {
  const [summary, setSummary] = useState<ClientPortfolioSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      setSummary(await api.get<ClientPortfolioSummary>('/clients/summary'));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, refetchSummary: fetchSummary };
}

/** `pageSize` viene de `useFitRows` en la página: las filas que entran en el
 * alto disponible (27/08/2026 — antes 50 fijas y scroll). */
export function useClientsDirectory(pageSize: number) {
  const filters = useDirectoryFilters();
  const rows = useDirectoryRows(filters, pageSize);
  return { ...filters, pageSize, ...rows, ...useDirectorySummary() };
}

export type ClientsDirectoryState = ReturnType<typeof useClientsDirectory>;
