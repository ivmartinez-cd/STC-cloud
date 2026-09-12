import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { enumParam, flagParam, pageParam, stringParam, useUrlSearchQuery, useUrlState } from '../../../shared/hooks/useUrlState';
import type {
  DeviceDirectoryGroup, DeviceDirectoryResponse, DeviceDirectorySegment, DeviceInventorySummary, SortDir,
} from '../types/deviceDirectory';

const SEGMENTS: DeviceDirectorySegment[] = ['todos', 'sin_contacto', 'con_alertas', 'consumible_bajo', 'sin_agente'];
const DIRS: SortDir[] = ['asc', 'desc'];

/** Filtro/orden/página/baja viven en la URL — mismo criterio que `useClientsDirectory`
 * (la URL manda, ver `useUrlState`). `baja=1` = incluir equipos dados de baja. */
const CODECS = {
  q: stringParam(),
  segment: enumParam(SEGMENTS, 'todos'),
  dir: enumParam(DIRS, 'desc'),
  page: pageParam,
  baja: flagParam(),
};

/** Estado de filtro/orden/página, derivado de la URL. Único campo ordenable
 * expuesto en la UI es `last_seen` (el mockup sólo pone flecha en ÚLT. CONTACTO) —
 * el backend igual soporta `alerts_count` para uso futuro. Chips/búsqueda/checkbox
 * resetean a la página 1 en el mismo `patch` — evita quedar en una página vacía. */
function useDirectoryFilters() {
  const [url, patch] = useUrlState(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  const setSegment = useCallback((segment: DeviceDirectorySegment) => patch({ segment, page: 0 }), [patch]);
  const setIncludeDecommissioned = useCallback((baja: boolean) => patch({ baja, page: 0 }), [patch]);
  const clearFilters = useCallback(() => { setRawQuery(''); patch({ q: '', segment: 'todos', page: 0 }); }, [patch, setRawQuery]);
  const toggleSort = useCallback(() => patch({ dir: url.dir === 'desc' ? 'asc' : 'desc' }), [patch, url.dir]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);
  return {
    rawQuery, setRawQuery, effectiveQuery, segment: url.segment, setSegment, clearFilters,
    sortDir: url.dir, toggleSort, page: url.page, setPage,
    includeDecommissioned: url.baja, setIncludeDecommissioned,
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
 * límite de 20 líneas/función de la guía. */
function useDirectoryRowsState() {
  const [groups, setGroups] = useState<DeviceDirectoryGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { groups, setGroups, total, setTotal, loading, setLoading, error, setError };
}

/** Página actual (grupos ya armados server-side) — reactiva a filtro/orden/página/baja. */
function useDirectoryRows(filters: DirectoryFilters, pageSize: number) {
  const { effectiveQuery, segment, sortDir, includeDecommissioned } = filters;
  const st = useDirectoryRowsState();
  const page = clampPage(filters.page, pageSize, st.total);
  const beginRequest = useLatestRequest();

  const fetchDirectory = useCallback(async () => {
    const isLatest = beginRequest();
    st.setLoading(true);
    st.setError('');
    try {
      const data = await fetchDirectoryPage(filters, page, pageSize);
      if (!isLatest()) return;
      st.setGroups(data.groups ?? []);
      st.setTotal(data.total ?? 0);
    } catch (e: unknown) {
      if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isLatest()) st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginRequest, effectiveQuery, segment, sortDir, page, includeDecommissioned, pageSize]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(st.total / pageSize));
  const rowCount = useMemo(() => st.groups.reduce((sum, g) => sum + g.rows.length, 0), [st.groups]);
  return { ...st, totalPages, page, rowCount, clientCount: st.groups.length, refetch: fetchDirectory };
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
  return { ...filters, pageSize, ...rows, ...useDirectorySummary() };
}

export type DeviceDirectoryState = ReturnType<typeof useDeviceDirectory>;
