import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import type { FleetSupplyRow, FleetSuppliesResponse, SuppliesSummaryResponse, SupplyKind, SupplyUrgency } from '../../../shared/types/supplies';
import { usePageSizeReset } from '../../../shared/hooks/usePageSizeReset';

export interface ClientOption { id: string; name: string }
export type UrgencyFilter = SupplyUrgency | '';

function useFilters() {
  const [initial] = useSearchParams();
  const [rawQuery, setRawQuery] = useState('');
  const [clientId, setClientId] = useState(() => initial.get('client_id') ?? '');
  const [kind, setKind] = useState<SupplyKind | ''>('');
  const [urgency, setUrgency] = useState<UrgencyFilter>('');
  const [page, setPage] = useState(0);
  const query = useDebounce(rawQuery, 300);
  useEffect(() => { setPage(0); }, [query, clientId, kind, urgency]);
  return { rawQuery, setRawQuery, query, clientId, setClientId, kind, setKind, urgency, setUrgency, page, setPage };
}

type Filters = ReturnType<typeof useFilters>;

export function buildSuppliesParams(f: Pick<Filters, 'query' | 'clientId' | 'kind' | 'urgency'>, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (f.query.trim().length >= 2) params.set('q', f.query.trim());
  if (f.clientId) params.set('client_id', f.clientId);
  if (f.kind) params.set('kind', f.kind);
  if (f.urgency) params.set('urgency', f.urgency);
  return params;
}

function useRowsState() {
  const [items, setItems] = useState<FleetSupplyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  return { items, setItems, total, setTotal, loading, setLoading, error, setError };
}

function useRows(f: Filters, pageSize: number) {
  const st = useRowsState();
  const fetchSupplies = useCallback(async () => {
    st.setLoading(true);
    st.setError('');
    try {
      const data = await api.get<FleetSuppliesResponse>(`/supplies?${buildSuppliesParams(f, f.page, pageSize).toString()}`);
      st.setItems(data.items);
      st.setTotal(data.total);
    } catch (e) {
      st.setError(e instanceof Error ? e.message : String(e));
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.query, f.clientId, f.kind, f.urgency, f.page, pageSize]);
  useEffect(() => { void fetchSupplies(); }, [fetchSupplies]);
  return { ...st, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchSupplies };
}

function useSummary(clientId: string) {
  const [summary, setSummary] = useState<SuppliesSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const params = clientId ? `?client_id=${clientId}` : '';
      setSummary(await api.get<SuppliesSummaryResponse>(`/supplies/summary${params}`));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, [clientId]);
  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading, summaryError, fetchSummary };
}

function rowKey(r: FleetSupplyRow): string { return `${r.device_id}-${r.key}`; }

/** `POST /supply-requests` una vez por ítem — no existe un endpoint de alta en
 * bloque, así que "generar pedidos" es N requests secuenciales (handoff hifi
 * #3, fase 3, 26/08/2026). Sin `device_id` la fila no genera nada (no debería
 * pasar: todas las filas de `/supplies` tienen equipo). */
async function generateOrderFor(row: FleetSupplyRow): Promise<boolean> {
  if (!row.device_id || !row.client_id) return false;
  const res = await api.post('/supply-requests', {
    client_id: row.client_id, device_id: row.device_id, supply_kind: row.kind, supply_color: row.color,
    sku: row.code ?? null,
  });
  return !!res;
}

type Toast = (msg: string, kind: 'success' | 'error') => void;

/** Núcleo compartido por "generar seleccionados" y "generar todos los
 * críticos" — separado del hook por el límite de 20 líneas/función. */
async function runGenerate(
  rows: FleetSupplyRow[], showToast: Toast, list: ReturnType<typeof useRows>, summary: ReturnType<typeof useSummary>,
  setBusy: (v: boolean) => void, onDone?: () => void
): Promise<void> {
  setBusy(true);
  try {
    const results = await Promise.all(rows.map(generateOrderFor));
    const ok = results.filter(Boolean).length;
    showToast(`${ok} pedido(s) generados`, ok > 0 ? 'success' : 'error');
    onDone?.();
    void Promise.all([list.fetchSupplies(), summary.fetchSummary()]);
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Error al generar pedidos', 'error');
  } finally {
    setBusy(false);
  }
}

/** Header "GENERAR PEDIDOS (N)" — trae TODOS los críticos (no sólo la página
 * visible) hasta un techo defensivo, y genera para todos. */
async function fetchAllCritical(clientId: string): Promise<FleetSupplyRow[]> {
  const params = new URLSearchParams({ urgency: 'critico', limit: '200' });
  if (clientId) params.set('client_id', clientId);
  return (await api.get<FleetSuppliesResponse>(`/supplies?${params.toString()}`)).items;
}

function useBulkGenerate(list: ReturnType<typeof useRows>, summary: ReturnType<typeof useSummary>) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const rowSelection = useRowSelection(list.items.map(rowKey));
  useEffect(() => { rowSelection.clear(); }, [list.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateSelected = () => {
    const rows = list.items.filter((r) => rowSelection.selected.has(rowKey(r)));
    return runGenerate(rows, showToast, list, summary, setBusy, rowSelection.clear);
  };
  const generateAllCritical = async (clientId: string) => runGenerate(await fetchAllCritical(clientId), showToast, list, summary, setBusy);

  return { busy, rowSelection, generateSelected, generateAllCritical, rowKey };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). */
export function useSuppliesPage(pageSize: number) {
  const { role } = useAuth();
  const canFilterByClient = role === 'admin' || role === 'operator';
  const filters = useFilters();
  usePageSizeReset(pageSize, filters.setPage);
  const list = useRows(filters, pageSize);
  const summaryState = useSummary(filters.clientId);
  const bulk = useBulkGenerate(list, summaryState);

  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => {
    if (canFilterByClient) api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad */ });
  }, [canFilterByClient]);

  return { canFilterByClient, clients, filters, ...list, ...summaryState, ...bulk };
}

export type SuppliesPageState = ReturnType<typeof useSuppliesPage>;
