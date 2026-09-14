import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { clampPage } from '../../../shared/lib/clampPage';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { useUrlState, useUrlSearchQuery, enumParam, stringParam, pageParam } from '../../../shared/hooks/useUrlState';
import type { ClientOption, EmailLogRow, EmailLogSummary, EmailStatus } from '../types/emailLog';

export type StatusFilter = 'todos' | EmailStatus;
const STATUSES: StatusFilter[] = ['todos', 'sent', 'error', 'skipped_no_transport', 'skipped_no_recipient'];

/** Búsqueda, estado y página viven en la URL (auditoría 12/09/2026: antes se
 * perdían al ir a "Asignar contacto" y volver, o con F5). Defaults omitidos. */
const CODECS = { q: stringParam(), status: enumParam(STATUSES, 'todos'), page: pageParam };

function useFilters() {
  const [url, patch] = useUrlState(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  const setStatus = useCallback((status: StatusFilter) => patch({ status, page: 0 }), [patch]);
  const setPage = useCallback((page: number) => patch({ page }), [patch]);
  return { rawQuery, setRawQuery, query: effectiveQuery, status: url.status, setStatus, page: url.page, setPage };
}

type Filters = ReturnType<typeof useFilters>;

function listParams(f: Filters, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (f.query.trim().length >= 2) params.set('q', f.query.trim());
  if (f.status !== 'todos') params.set('status', f.status);
  return params;
}

function requestEmailLogPage(f: Filters, page: number, pageSize: number): Promise<{ items: EmailLogRow[]; total: number }> {
  return api.get<{ items: EmailLogRow[]; total: number }>(`/email-log?${listParams(f, page, pageSize).toString()}`);
}

/** Sólo el `useState` — separado de `useRows` por el límite de 20 líneas/función. */
function useRowsState() {
  const [items, setItems] = useState<EmailLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { items, setItems, total, setTotal, loading, setLoading, error, setError };
}

type RowsState = ReturnType<typeof useRowsState>;

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadRows(st: RowsState, f: Filters, page: number, pageSize: number, isLatest: () => boolean) {
  if (!st.items.length) st.setLoading(true);
  st.setError('');
  try {
    const data = await requestEmailLogPage(f, page, pageSize);
    if (!isLatest()) return;
    st.setItems(data.items);
    st.setTotal(data.total);
  } catch (e) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useRows(f: Filters, pageSize: number) {
  const st = useRowsState();
  const beginRequest = useLatestRequest();
  // `?page=` acotada al mostrar/pedir, sin persistir el clamp (ver `clampPage`).
  const page = clampPage(f.page, pageSize, st.total);
  const fetchRows = useCallback(
    () => loadRows(st, f, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.query, f.status, page, pageSize],
  );
  useEffect(() => { void fetchRows(); }, [fetchRows]);
  return { ...st, page, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchRows };
}

function useSummary() {
  const [summary, setSummary] = useState<EmailLogSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      setSummary(await api.get<EmailLogSummary>('/email-log/summary'));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, fetchSummary };
}

function useClients() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => { api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad: nombre de cliente por id */ }); }, []);
  const nameOf = useCallback((id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? '…' : 'Sin cliente'), [clients]);
  return { clients, nameOf };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). */
export function useEmailLogPage(pageSize: number) {
  const filters = useFilters();
  const rows = useRows(filters, pageSize);
  // `filters.page` expuesta ya acotada (es lo que muestra el paginador).
  const exposed = useMemo(() => ({ ...filters, page: rows.page }), [filters, rows.page]);
  return { filters: exposed, ...rows, ...useSummary(), ...useClients() };
}

export type EmailLogPageState = ReturnType<typeof useEmailLogPage>;
