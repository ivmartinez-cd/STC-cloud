import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { enumParam, pageParam, stringParam, useUrlSearchQuery, useUrlState } from '../../../shared/hooks/useUrlState';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import type {
  AgentDeviceDirectoryResponse, AgentDeviceDirectoryRow, AgentDeviceSegment, AgentDeviceSortField, SortDir,
} from '../types/monitorDetail';

/** Tabla "Equipos detectados por este monitor" (handoff hifi "Monitor — detalle",
 * 25/08/2026) — mismo patrón que `useClientDeviceDirectory.ts`, scopeada a UN
 * agente en vez de un cliente. El tamaño de página lo decide la pantalla
 * (`useFitRows`, 27/08/2026). */

const SEGMENTS: readonly AgentDeviceSegment[] = ['todos', 'sin_conexion', 'con_alertas', 'sin_aprobar'];
const SORT_FIELDS: readonly AgentDeviceSortField[] = ['alerts_count', 'consumible_pct', 'last_seen'];
const DIRS: readonly SortDir[] = ['asc', 'desc'];

/** Filtro/orden/página viven en la URL (README: "Tab, filtro, orden y página
 * reflejados en la URL") — la URL es la única fuente de verdad, ver `useUrlState`.
 * Los params quedan en la URL aunque otra tab esté visible (así se restauran al
 * volver); sólo se escriben desde la tab "Dispositivos" activa. */
const CODECS = {
  q: stringParam(),
  segment: enumParam(SEGMENTS, 'todos'),
  sort: enumParam(SORT_FIELDS, 'alerts_count'),
  dir: enumParam(DIRS, 'desc'),
  page: pageParam,
};

function useDeviceFilters(active: boolean) {
  const [url, patch] = useUrlState(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }), active);

  // Chips/búsqueda/orden resetean a la página 1 en el mismo write — evita quedar
  // en una página vacía y un segundo fetch con la página vieja.
  const setSegment = useCallback((segment: AgentDeviceSegment) => patch({ segment, page: 0 }), [patch]);
  const clearFilters = useCallback(() => { setRawQuery(''); patch({ q: '', segment: 'todos', page: 0 }); }, [patch, setRawQuery]);
  const toggleSort = useCallback((field: AgentDeviceSortField) => {
    patch({ sort: field, dir: url.sort === field && url.dir === 'desc' ? 'asc' : 'desc', page: 0 });
  }, [patch, url.sort, url.dir]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);

  return {
    rawQuery, setRawQuery, effectiveQuery, segment: url.segment, setSegment, clearFilters,
    sortField: url.sort, sortDir: url.dir, toggleSort, page: url.page, setPage,
  };
}

type DeviceFilters = ReturnType<typeof useDeviceFilters>;

function useDeviceRows(agentId: string, filters: DeviceFilters, pageSize: number) {
  const { effectiveQuery, segment, sortField, sortDir } = filters;
  const [rows, setRows] = useState<AgentDeviceDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const page = clampPage(filters.page, pageSize, total);
  const beginRequest = useLatestRequest();

  const fetchDirectory = useCallback(async () => {
    const isLatest = beginRequest();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      sort: sortField, dir: sortDir, limit: String(pageSize), offset: String(page * pageSize),
    });
    if (effectiveQuery) params.set('q', effectiveQuery);
    if (segment !== 'todos') params.set('segment', segment);
    try {
      const data = await api.get<AgentDeviceDirectoryResponse>(`/agents/${agentId}/devices/directory?${params.toString()}`);
      if (!isLatest()) return;
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      if (isLatest()) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [agentId, effectiveQuery, segment, sortField, sortDir, page, pageSize, beginRequest]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, totalPages, pageSize, page, loading, error, refetch: fetchDirectory };
}

export function useMonitorDeviceDirectory(agentId: string, active: boolean, pageSize: number) {
  const filters = useDeviceFilters(active);
  const rows = useDeviceRows(agentId, filters, pageSize);
  const hasActiveFilters = useMemo(() => filters.effectiveQuery !== '' || filters.segment !== 'todos', [filters.effectiveQuery, filters.segment]);
  return { ...filters, ...rows, hasActiveFilters };
}

export type MonitorDeviceDirectoryState = ReturnType<typeof useMonitorDeviceDirectory>;
