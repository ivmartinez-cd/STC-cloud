import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { clampPage } from '../../../shared/lib/clampPage';
import { useUpdateEffect } from '../../../shared/hooks/useUpdateEffect';
import type {
  ClientDirectoryResponse, ClientDirectoryRow, ClientPortfolioSummary, ClientSegment, ClientSortField, SortDir,
} from '../types/clientsDirectory';

const SEGMENTS: ClientSegment[] = ['todos', 'sin_contacto', 'con_alertas', 'sin_reporte_24h'];
const SORT_FIELDS: ClientSortField[] = ['monitor_count', 'device_count', 'alerts_count', 'last_report_at'];

function parseSegment(v: string | null): ClientSegment {
  return v && (SEGMENTS as string[]).includes(v) ? (v as ClientSegment) : 'todos';
}
function parseSortField(v: string | null): ClientSortField {
  return v && (SORT_FIELDS as string[]).includes(v) ? (v as ClientSortField) : 'device_count';
}
function parseSortDir(v: string | null): SortDir {
  return v === 'asc' ? 'asc' : 'desc';
}
/** `?page=` es 1-based (como se muestra); el estado es 0-based. */
function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 1 ? n - 1 : 0;
}

/** Filtro/orden/página reflejados en la URL (README: "para poder compartir la
 * vista") — valores por defecto se omiten para no ensuciarla. */
function useUrlSync(q: string, segment: ClientSegment, sortField: ClientSortField, sortDir: SortDir, page: number) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (q) next.set('q', q); else next.delete('q');
    if (segment !== 'todos') next.set('segment', segment); else next.delete('segment');
    if (sortField !== 'device_count') next.set('sort', sortField); else next.delete('sort');
    if (sortDir !== 'desc') next.set('dir', sortDir); else next.delete('dir');
    if (page > 0) next.set('page', String(page + 1)); else next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, segment, sortField, sortDir, page]);
}

/** Estado de filtro/orden/página, sincronizado con la URL al montar y en cada cambio. */
function useDirectoryFilters() {
  const [initial] = useSearchParams();
  const [rawQuery, setRawQuery] = useState(initial.get('q') ?? '');
  const [segment, setSegmentState] = useState<ClientSegment>(() => parseSegment(initial.get('segment')));
  const [sortField, setSortField] = useState<ClientSortField>(() => parseSortField(initial.get('sort')));
  const [sortDir, setSortDir] = useState<SortDir>(() => parseSortDir(initial.get('dir')));
  const [page, setPage] = useState(() => parsePage(initial.get('page')));

  const debouncedQuery = useDebounce(rawQuery, 300);
  // Mínimo 2 caracteres (README, "Buscador"): por debajo de eso no se manda `q`.
  const effectiveQuery = debouncedQuery.trim().length >= 2 ? debouncedQuery.trim() : '';

  useUrlSync(effectiveQuery, segment, sortField, sortDir, page);
  // Chips/búsqueda resetean a la página 1 (README) — evita quedar en una página vacía.
  // No corre al montar: respeta el `?page=` restaurado de la URL.
  useUpdateEffect(() => { setPage(0); }, [effectiveQuery, segment]);

  const setSegment = useCallback((s: ClientSegment) => setSegmentState(s), []);
  const clearFilters = useCallback(() => { setRawQuery(''); setSegmentState('todos'); }, []);
  const toggleSort = useCallback((field: ClientSortField) => {
    setSortField((prevField) => {
      if (prevField === field) { setSortDir((prevDir) => (prevDir === 'desc' ? 'asc' : 'desc')); return prevField; }
      setSortDir('desc');
      return field;
    });
    setPage(0);
  }, []);

  return { rawQuery, setRawQuery, effectiveQuery, segment, setSegment, clearFilters, sortField, sortDir, toggleSort, page, setPage };
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

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ sort: sortField, dir: sortDir, limit: String(pageSize), offset: String(page * pageSize) });
    if (effectiveQuery) params.set('q', effectiveQuery);
    if (segment !== 'todos') params.set('segment', segment);
    try {
      const data = await api.get<ClientDirectoryResponse>(`/clients/directory?${params.toString()}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [effectiveQuery, segment, sortField, sortDir, page, pageSize]);

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
