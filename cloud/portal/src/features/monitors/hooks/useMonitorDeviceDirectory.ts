import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import type {
  AgentDeviceDirectoryResponse, AgentDeviceDirectoryRow, AgentDeviceSegment, AgentDeviceSortField, SortDir,
} from '../types/monitorDetail';

/** Tabla "Equipos detectados por este monitor" (handoff hifi "Monitor — detalle",
 * 25/08/2026) — mismo patrón que `useClientDeviceDirectory.ts`, scopeada a UN
 * agente en vez de un cliente. El tamaño de página lo decide la pantalla
 * (`useFitRows`, 27/08/2026). */

const SEGMENTS: AgentDeviceSegment[] = ['todos', 'sin_conexion', 'con_alertas', 'sin_aprobar'];
const SORT_FIELDS: AgentDeviceSortField[] = ['alerts_count', 'consumible_pct', 'last_seen'];

function parseSegment(v: string | null): AgentDeviceSegment {
  return v && (SEGMENTS as string[]).includes(v) ? (v as AgentDeviceSegment) : 'todos';
}
function parseSortField(v: string | null): AgentDeviceSortField {
  return v && (SORT_FIELDS as string[]).includes(v) ? (v as AgentDeviceSortField) : 'alerts_count';
}
function parseSortDir(v: string | null): SortDir {
  return v === 'asc' ? 'asc' : 'desc';
}
function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Filtro/orden/página reflejados en la URL (README: "Tab, filtro, orden y página
 * reflejados en la URL") — sólo mientras la tab "Dispositivos" está activa, para no
 * pisar los query params de otras tabs (ver `MonitorDetail.tsx`). */
function useUrlSync(active: boolean, q: string, segment: AgentDeviceSegment, sortField: AgentDeviceSortField, sortDir: SortDir, page: number) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!active) return;
    const next = new URLSearchParams(searchParams);
    if (q) next.set('q', q); else next.delete('q');
    if (segment !== 'todos') next.set('segment', segment); else next.delete('segment');
    if (sortField !== 'alerts_count') next.set('sort', sortField); else next.delete('sort');
    if (sortDir !== 'desc') next.set('dir', sortDir); else next.delete('dir');
    if (page > 0) next.set('page', String(page)); else next.delete('page');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, q, segment, sortField, sortDir, page]);
}

function useDeviceFilters(active: boolean) {
  const [initial] = useSearchParams();
  const [rawQuery, setRawQuery] = useState(initial.get('q') ?? '');
  const [segment, setSegment] = useState<AgentDeviceSegment>(() => parseSegment(initial.get('segment')));
  const [sortField, setSortField] = useState<AgentDeviceSortField>(() => parseSortField(initial.get('sort')));
  const [sortDir, setSortDir] = useState<SortDir>(() => parseSortDir(initial.get('dir')));
  const [page, setPage] = useState(() => parsePage(initial.get('page')));

  const debouncedQuery = useDebounce(rawQuery, 300);
  const effectiveQuery = debouncedQuery.trim().length >= 2 ? debouncedQuery.trim() : '';

  useUrlSync(active, effectiveQuery, segment, sortField, sortDir, page);
  // No resetear la página restaurada de la URL al montar (sólo ante un cambio real
  // de filtro/búsqueda hecho por el usuario) — si no, "volver" a una página > 0 nunca funciona.
  const didMountFilters = useRef(false);
  useEffect(() => {
    if (!didMountFilters.current) { didMountFilters.current = true; return; }
    setPage(0);
  }, [effectiveQuery, segment]);

  const clearFilters = useCallback(() => { setRawQuery(''); setSegment('todos'); }, []);
  const toggleSort = useCallback((field: AgentDeviceSortField) => {
    setSortField((prevField) => {
      if (prevField === field) { setSortDir((prevDir) => (prevDir === 'desc' ? 'asc' : 'desc')); return prevField; }
      setSortDir('desc');
      return field;
    });
    setPage(0);
  }, []);

  return { rawQuery, setRawQuery, effectiveQuery, segment, setSegment, clearFilters, sortField, sortDir, toggleSort, page, setPage };
}

type DeviceFilters = ReturnType<typeof useDeviceFilters>;

function useDeviceRows(agentId: string, filters: DeviceFilters, pageSize: number) {
  const { effectiveQuery, segment, sortField, sortDir, page } = filters;
  const [rows, setRows] = useState<AgentDeviceDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      sort: sortField, dir: sortDir, limit: String(pageSize), offset: String(page * pageSize),
    });
    if (effectiveQuery) params.set('q', effectiveQuery);
    if (segment !== 'todos') params.set('segment', segment);
    try {
      const data = await api.get<AgentDeviceDirectoryResponse>(`/agents/${agentId}/devices/directory?${params.toString()}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [agentId, effectiveQuery, segment, sortField, sortDir, page, pageSize]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, totalPages, pageSize, loading, error, refetch: fetchDirectory };
}

export function useMonitorDeviceDirectory(agentId: string, active: boolean, pageSize: number) {
  const filters = useDeviceFilters(active);
  usePageSizeReset(pageSize, filters.setPage);
  const rows = useDeviceRows(agentId, filters, pageSize);
  const hasActiveFilters = useMemo(() => filters.effectiveQuery !== '' || filters.segment !== 'todos', [filters.effectiveQuery, filters.segment]);
  return { ...filters, ...rows, hasActiveFilters };
}

export type MonitorDeviceDirectoryState = ReturnType<typeof useMonitorDeviceDirectory>;
