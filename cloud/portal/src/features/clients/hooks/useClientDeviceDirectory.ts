import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import type {
  ClientDeviceDirectoryResponse, ClientDeviceDirectoryRow, ClientDeviceSegment, ClientDeviceSortField, SortDir,
} from '../types/clientDetail';

const SEGMENTS: ClientDeviceSegment[] = ['todos', 'sin_conexion', 'con_alertas', 'consumible_bajo'];
const SORT_FIELDS: ClientDeviceSortField[] = ['alerts_count', 'consumible_pct', 'last_seen'];

function parseSegment(v: string | null): ClientDeviceSegment {
  return v && (SEGMENTS as string[]).includes(v) ? (v as ClientDeviceSegment) : 'todos';
}
function parseSortField(v: string | null): ClientDeviceSortField {
  return v && (SORT_FIELDS as string[]).includes(v) ? (v as ClientDeviceSortField) : 'alerts_count';
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
 * pisar los query params de otras tabs (ver `ClientDetail.tsx`). */
function useUrlSync(active: boolean, q: string, segment: ClientDeviceSegment, sortField: ClientDeviceSortField, sortDir: SortDir, page: number) {
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
  const [segment, setSegment] = useState<ClientDeviceSegment>(() => parseSegment(initial.get('segment')));
  const [sortField, setSortField] = useState<ClientDeviceSortField>(() => parseSortField(initial.get('sort')));
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
  const toggleSort = useCallback((field: ClientDeviceSortField) => {
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

function useDeviceRows(clientId: string, filters: DeviceFilters, pageSize: number) {
  const { effectiveQuery, segment, sortField, sortDir, page } = filters;
  const [rows, setRows] = useState<ClientDeviceDirectoryRow[]>([]);
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
      const data = await api.get<ClientDeviceDirectoryResponse>(`/clients/${clientId}/devices/directory?${params.toString()}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId, effectiveQuery, segment, sortField, sortDir, page, pageSize]);

  useEffect(() => { void fetchDirectory(); }, [fetchDirectory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, totalPages, loading, error, refetch: fetchDirectory };
}

/** Tabla "Infraestructura de monitoreo" del detalle de cliente (handoff hifi
 * "Cliente — detalle", 25/08/2026) — mismo patrón que `useClientsDirectory.ts`,
 * pero scopeada a UN cliente. `pageSize` viene de `useFitRows` en la sección:
 * las filas que entran en el alto disponible (27/08/2026 — antes 50 fijas). */
export function useClientDeviceDirectory(clientId: string, active: boolean, pageSize: number) {
  const filters = useDeviceFilters(active);
  usePageSizeReset(pageSize, filters.setPage);
  const rows = useDeviceRows(clientId, filters, pageSize);
  const hasActiveFilters = useMemo(() => filters.effectiveQuery !== '' || filters.segment !== 'todos', [filters.effectiveQuery, filters.segment]);
  return { ...filters, ...rows, hasActiveFilters, pageSize };
}

export type ClientDeviceDirectoryState = ReturnType<typeof useClientDeviceDirectory>;
