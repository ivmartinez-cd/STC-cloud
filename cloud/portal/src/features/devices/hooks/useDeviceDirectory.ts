import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import { useUpdateEffect } from '../../../shared/hooks/useUpdateEffect';
import type {
  DeviceDirectoryGroup, DeviceDirectoryResponse, DeviceDirectorySegment, DeviceInventorySummary, SortDir,
} from '../types/deviceDirectory';

const SEGMENTS: DeviceDirectorySegment[] = ['todos', 'sin_contacto', 'con_alertas', 'consumible_bajo', 'sin_agente'];

function parseSegment(v: string | null): DeviceDirectorySegment {
  return v && (SEGMENTS as string[]).includes(v) ? (v as DeviceDirectorySegment) : 'todos';
}
function parseSortDir(v: string | null): SortDir {
  return v === 'asc' ? 'asc' : 'desc';
}
function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Filtro/orden/página/baja reflejados en la URL — mismo criterio que `useClientsDirectory`. */
function useUrlSync(q: string, segment: DeviceDirectorySegment, sortDir: SortDir, page: number, includeDecommissioned: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (q) next.set('q', q); else next.delete('q');
    if (segment !== 'todos') next.set('segment', segment); else next.delete('segment');
    if (sortDir !== 'desc') next.set('dir', sortDir); else next.delete('dir');
    if (page > 0) next.set('page', String(page)); else next.delete('page');
    if (includeDecommissioned) next.set('baja', '1'); else next.delete('baja');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, segment, sortDir, page, includeDecommissioned]);
}

/** Sólo el `useState` — separado de `useDirectoryFilters` para que ninguna de las 2
 * funciones cruce el límite de 20 líneas/función de la guía. */
function useDirectoryFilterState() {
  const [initial] = useSearchParams();
  const [rawQuery, setRawQuery] = useState(initial.get('q') ?? '');
  const [segment, setSegmentState] = useState<DeviceDirectorySegment>(() => parseSegment(initial.get('segment')));
  const [sortDir, setSortDir] = useState<SortDir>(() => parseSortDir(initial.get('dir')));
  const [page, setPage] = useState(() => parsePage(initial.get('page')));
  const [includeDecommissioned, setIncludeDecommissioned] = useState(() => initial.get('baja') === '1');
  return { rawQuery, setRawQuery, segment, setSegmentState, sortDir, setSortDir, page, setPage, includeDecommissioned, setIncludeDecommissioned };
}

/** Estado de filtro/orden/página, sincronizado con la URL. Único campo ordenable
 * expuesto en la UI es `last_seen` (el mockup sólo pone flecha en ÚLT. CONTACTO) —
 * el backend igual soporta `alerts_count` para uso futuro. */
function useDirectoryFilters() {
  const s = useDirectoryFilterState();
  const debouncedQuery = useDebounce(s.rawQuery, 300);
  const effectiveQuery = debouncedQuery.trim().length >= 2 ? debouncedQuery.trim() : '';
  useUrlSync(effectiveQuery, s.segment, s.sortDir, s.page, s.includeDecommissioned);
  // Chips/búsqueda/checkbox resetean a la página 1 — evita quedar en una página vacía.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // No corre al montar: respeta el `?page=` restaurado de la URL.
  useUpdateEffect(() => { s.setPage(0); }, [effectiveQuery, s.segment, s.includeDecommissioned]);
  return {
    ...s, effectiveQuery,
    setSegment: s.setSegmentState,
    clearFilters: () => { s.setRawQuery(''); s.setSegmentState('todos'); },
    toggleSort: () => s.setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')),
  };
}

type DirectoryFilters = ReturnType<typeof useDirectoryFilters>;

function directoryParams(filters: DirectoryFilters, page: number, pageSize: number): URLSearchParams {
  const { effectiveQuery, segment, sortDir, includeDecommissioned } = filters;
  const params = new URLSearchParams({ sort: 'last_seen', dir: sortDir, limit: String(pageSize), offset: String(page * pageSize) });
  if (effectiveQuery) params.set('q', effectiveQuery);
  if (segment !== 'todos') params.set('segment', segment);
  if (includeDecommissioned) params.set('include', 'decommissioned');
  return params;
}

function fetchDirectoryPage(filters: DirectoryFilters, page: number, pageSize: number): Promise<DeviceDirectoryResponse> {
  return api.get<DeviceDirectoryResponse>(`/devices/directory?${directoryParams(filters, page, pageSize).toString()}`);
}

/** Sólo el `useState` de la página actual — separado de `useDirectoryRows` por el
 * mismo motivo que `useDirectoryFilterState`. */
function useDirectoryRowsState() {
  const [groups, setGroups] = useState<DeviceDirectoryGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { groups, setGroups, total, setTotal, loading, setLoading, error, setError };
}

/** Página actual (grupos ya armados server-side) — reactiva a filtro/orden/página/baja. */
function useDirectoryRows(filters: DirectoryFilters, pageSize: number) {
  const { effectiveQuery, segment, sortDir, page, includeDecommissioned } = filters;
  const st = useDirectoryRowsState();

  const fetchDirectory = useCallback(async () => {
    st.setLoading(true);
    st.setError('');
    try {
      const data = await fetchDirectoryPage(filters, page, pageSize);
      st.setGroups(data.groups ?? []);
      st.setTotal(data.total ?? 0);
    } catch (e: unknown) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveQuery, segment, sortDir, page, includeDecommissioned, pageSize]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(st.total / pageSize));
  const rowCount = useMemo(() => st.groups.reduce((sum, g) => sum + g.rows.length, 0), [st.groups]);
  return { ...st, totalPages, rowCount, clientCount: st.groups.length, refetch: fetchDirectory };
}

/** Tira de métricas del inventario — endpoint aparte, loading/error independientes de la tabla. */
function useDirectorySummary() {
  const [summary, setSummary] = useState<DeviceInventorySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      setSummary(await api.get<DeviceInventorySummary>('/devices/summary'));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, refetchSummary: fetchSummary };
}

/** `pageSize` viene de `useFitRows` en la página: las filas de equipo que entran
 * en el alto disponible (27/08/2026 — antes 50 fijas y scroll). */
export function useDeviceDirectory(pageSize: number) {
  const filters = useDirectoryFilters();
  const rows = useDirectoryRows(filters, pageSize);
  usePageSizeReset(pageSize, filters.setPage, rows.total);
  return { ...filters, pageSize, ...rows, ...useDirectorySummary() };
}

export type DeviceDirectoryState = ReturnType<typeof useDeviceDirectory>;
