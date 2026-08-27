import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import type { AuditLogItem, AuditLogsResponse, AuditSummary } from '../../../shared/types/audit';
import { todayIso } from '../lib/activityPresentation';

// Mismos sets que `get-audit-summary.ts` (CONFIG_ACTIONS/DEVICE_DOWN_ACTIONS)
// — duplicados a propósito, no hay endpoint que los sirva y son sólo 2
// chips de filtro, no vale la pena un catálogo nuevo por esto.
const CONFIG_ACTIONS = ['SYSTEM_SETTINGS_UPDATED', 'UPDATE_CONFIG', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED'].join(',');
const DEVICE_DOWN_ACTIONS = ['DEVICE_DECOMMISSIONED', 'DEVICES_BULK_DECOMMISSIONED'].join(',');

export type SegmentFilter = 'all' | 'config' | 'down' | 'others';

export interface ActivityFiltersState {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  q: string; setQ: (v: string) => void;
  segment: SegmentFilter; setSegment: (v: SegmentFilter) => void;
  clientId: string;
}

/** `client_id` sólo por deep-link (`/activity?client_id=` desde Cliente
 * Detalle) — mismo criterio que Alertas/Incidentes: sin selector manual en
 * la barra, el mockup tampoco lo tiene. */
function useFilters(): ActivityFiltersState {
  const [initial] = useSearchParams();
  const [from, setFrom] = useState(todayIso(30));
  const [to, setTo] = useState(todayIso(0));
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [clientId] = useState(() => initial.get('client_id') ?? '');
  return { from, setFrom, to, setTo, q, setQ, segment, setSegment, clientId };
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

function useRows(f: ActivityFiltersState, topOperatorUserId: string | null, page: number, pageSize: number) {
  const st = useRowsState();
  const fetchItems = useCallback(async () => {
    st.setLoading(true);
    st.setError('');
    try {
      const qs = buildActivityQueryParams(f, topOperatorUserId, page, pageSize).toString();
      const data = await api.get<AuditLogsResponse>(`/audit-logs?${qs}`);
      st.setItems(data.items);
      st.setTotal(data.total);
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.from, f.to, f.q, f.clientId, f.segment, topOperatorUserId, page, pageSize]);
  useEffect(() => { void fetchItems(); }, [fetchItems]);
  return { ...st, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchItems };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). */
export function useActivityPage(pageSize: number) {
  const filters = useFilters();
  const [page, setPage] = useState(0);
  const { summary, summaryLoading, summaryError, fetchSummary } = useSummary(filters);
  const list = useRows(filters, summary?.top_operator?.user_id ?? null, page, pageSize);
  useEffect(() => { setPage(0); }, [filters.from, filters.to, filters.q, filters.clientId, filters.segment]);
  usePageSizeReset(pageSize, setPage);
  return { filters, page, setPage, summary, summaryLoading, summaryError, fetchSummary, ...list };
}

export type ActivityPageState = ReturnType<typeof useActivityPage>;
