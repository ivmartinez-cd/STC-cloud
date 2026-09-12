import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { useUrlState, useUrlSearchQuery, enumParam, stringParam, pageParam, type UrlCodec, type UrlPatch } from '../../../shared/hooks/useUrlState';
import type { AuditLogItem, AuditLogsResponse, AuditSummary } from '../../../shared/types/audit';
import { todayIso } from '../lib/activityPresentation';

// Mismos sets que `get-audit-summary.ts` (CONFIG_ACTIONS/DEVICE_DOWN_ACTIONS)
// — duplicados a propósito, no hay endpoint que los sirva y son sólo 2
// chips de filtro, no vale la pena un catálogo nuevo por esto.
const CONFIG_ACTIONS = ['SYSTEM_SETTINGS_UPDATED', 'UPDATE_CONFIG', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED'].join(',');
const DEVICE_DOWN_ACTIONS = ['DEVICE_DECOMMISSIONED', 'DEVICES_BULK_DECOMMISSIONED'].join(',');

export type SegmentFilter = 'all' | 'config' | 'down' | 'others';
const SEGMENTS: SegmentFilter[] = ['all', 'config', 'down', 'others'];

export interface ActivityFiltersState {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  q: string; setQ: (v: string) => void;
  segment: SegmentFilter; setSegment: (v: SegmentFilter) => void;
  clientId: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha `YYYY-MM-DD` con default móvil (hoy / hace 30 días): ausente o basura →
 * default (que no se escribe en la URL); `?from=` vacío = "sin límite" (el input
 * `type="date"` lo emite al borrar, y antes también significaba eso). */
function dateParam(defaultOf: () => string): UrlCodec<string> {
  return {
    parse: (raw) => (raw === null ? defaultOf() : raw === '' || (ISO_DATE.test(raw) && !Number.isNaN(Date.parse(raw))) ? raw : defaultOf()),
    format: (value) => (value === defaultOf() ? null : value),
  };
}

/** Rango, búsqueda, segmento, cliente y página viven en la URL (auditoría
 * 12/09/2026: antes sólo `client_id`, leído una vez, y el resto se perdía al volver
 * de un equipo o con F5). `client_id` sólo por deep-link (`/activity?client_id=`
 * desde Cliente Detalle) — sin selector manual en la barra, el mockup tampoco lo tiene. */
const CODECS = {
  from: dateParam(() => todayIso(30)), to: dateParam(() => todayIso(0)),
  q: stringParam(), segment: enumParam(SEGMENTS, 'all'), client_id: stringParam(), page: pageParam,
};
type UrlFilters = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

function useFilterSetters(patch: UrlPatch<UrlFilters>) {
  return useMemo(() => ({
    setFrom: (from: string) => patch({ from, page: 0 }),
    setTo: (to: string) => patch({ to, page: 0 }),
    setSegment: (segment: SegmentFilter) => patch({ segment, page: 0 }),
    setPage: (page: number) => patch({ page }),
  }), [patch]);
}

type ActivityFilters = ActivityFiltersState & { effectiveQuery: string; page: number; setPage: (page: number) => void };

function useFilters(): ActivityFilters {
  const [url, patch] = useUrlState<UrlFilters>(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  return {
    from: url.from, to: url.to, q: rawQuery, setQ: setRawQuery, effectiveQuery,
    segment: url.segment, clientId: url.client_id, page: url.page,
    ...useFilterSetters(patch),
  };
}

/** Traduce el segmento activo + `topOperator` (para "OTROS OPERADORES") a
 * los params reales que entiende `/audit-logs` — separado para reusarlo
 * igual en el listado paginado y en el export CSV completo. */
export function buildActivityQueryParams(f: ActivityFiltersState, topOperatorUserId: string | null, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams();
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', `${f.to}T23:59:59.999Z`);
  if (f.q.trim().length >= 2) params.set('q', f.q.trim());
  if (f.clientId) params.set('client_id', f.clientId);
  if (f.segment === 'config') params.set('action', CONFIG_ACTIONS);
  if (f.segment === 'down') params.set('action', DEVICE_DOWN_ACTIONS);
  if (f.segment === 'others' && topOperatorUserId) params.set('exclude_user_id', topOperatorUserId);
  params.set('limit', String(pageSize));
  params.set('offset', String(page * pageSize));
  return params;
}

// Independiente de los chips de segmento de la tabla (CONFIGURACIÓN/BAJAS/
// OTROS OPERADORES) — mismo criterio que `useAlertSummary` de Alertas: la
// tira de métricas reacciona sólo al rango/búsqueda/cliente, nunca a un
// filtro que sólo tiene sentido en la tabla de abajo.
function useSummary(f: ActivityFiltersState) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', `${f.to}T23:59:59.999Z`);
    if (f.q.trim().length >= 2) params.set('q', f.q.trim());
    if (f.clientId) params.set('client_id', f.clientId);
    try { setSummary(await api.get<AuditSummary>(`/audit-logs/summary?${params.toString()}`)); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [f.from, f.to, f.q, f.clientId]);
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading: loading, summaryError: error, fetchSummary };
}

function useRowsState() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { items, setItems, total, setTotal, loading, setLoading, error, setError };
}

type RowsState = ReturnType<typeof useRowsState>;

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadRows(st: RowsState, f: ActivityFiltersState, topOperatorUserId: string | null, page: number, pageSize: number, isLatest: () => boolean) {
  st.setLoading(true);
  st.setError('');
  try {
    const qs = buildActivityQueryParams(f, topOperatorUserId, page, pageSize).toString();
    const data = await api.get<AuditLogsResponse>(`/audit-logs?${qs}`);
    if (!isLatest()) return;
    st.setItems(data.items);
    st.setTotal(data.total);
  } catch (e) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useRows(f: ActivityFiltersState, topOperatorUserId: string | null, requestedPage: number, pageSize: number) {
  const st = useRowsState();
  const beginRequest = useLatestRequest();
  // `?page=` acotada al mostrar/pedir, sin persistir el clamp (ver `clampPage`).
  const page = clampPage(requestedPage, pageSize, st.total);
  const fetchItems = useCallback(
    () => loadRows(st, f, topOperatorUserId, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.from, f.to, f.q, f.clientId, f.segment, topOperatorUserId, page, pageSize],
  );
  useEffect(() => { void fetchItems(); }, [fetchItems]);
  return { ...st, page, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchItems };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). */
export function useActivityPage(pageSize: number) {
  const filters = useFilters();
  // Los fetches usan la búsqueda efectiva (debounce, ≥2 chars); el input, la cruda.
  const effective = { ...filters, q: filters.effectiveQuery };
  const { summary, summaryLoading, summaryError, fetchSummary } = useSummary(effective);
  const list = useRows(effective, summary?.top_operator?.user_id ?? null, filters.page, pageSize);
  return { filters, setPage: filters.setPage, summary, summaryLoading, summaryError, fetchSummary, ...list };
}

export type ActivityPageState = ReturnType<typeof useActivityPage>;
