import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';
import type { ClientOption, EmailLogRow, EmailLogSummary, EmailStatus } from '../types/emailLog';

export type StatusFilter = 'todos' | EmailStatus;

function useFilters() {
  const [rawQuery, setRawQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [page, setPage] = useState(0);
  const query = useDebounce(rawQuery, 300);
  useEffect(() => { setPage(0); }, [query, status]);
  return { rawQuery, setRawQuery, query, status, setStatus, page, setPage };
}

type Filters = ReturnType<typeof useFilters>;

function listParams(f: Filters, pageSize: number): URLSearchParams {
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(f.page * pageSize) });
  if (f.query.trim().length >= 2) params.set('q', f.query.trim());
  if (f.status !== 'todos') params.set('status', f.status);
  return params;
}

function requestEmailLogPage(f: Filters, pageSize: number): Promise<{ items: EmailLogRow[]; total: number }> {
  return api.get<{ items: EmailLogRow[]; total: number }>(`/email-log?${listParams(f, pageSize).toString()}`);
}

/** Sólo el `useState` — separado de `useRows` por el límite de 20 líneas/función. */
function useRowsState() {
  const [items, setItems] = useState<EmailLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { items, setItems, total, setTotal, loading, setLoading, error, setError };
}

function useRows(f: Filters, pageSize: number) {
  const st = useRowsState();
  const fetchRows = useCallback(async () => {
    st.setLoading(true);
    st.setError('');
    try {
      const data = await requestEmailLogPage(f, pageSize);
      st.setItems(data.items);
      st.setTotal(data.total);
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.query, f.status, f.page, pageSize]);
  useEffect(() => { void fetchRows(); }, [fetchRows]);
  return { ...st, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchRows };
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
  usePageSizeReset(pageSize, filters.setPage, rows.total);
  return { filters, ...rows, ...useSummary(), ...useClients() };
}

export type EmailLogPageState = ReturnType<typeof useEmailLogPage>;
