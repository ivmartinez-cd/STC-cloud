import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { clampPage } from '../../../shared/lib/clampPage';
import { useUrlState, useUrlSearchQuery, enumParam, stringParam, pageParam, type UrlPatch } from '../../../shared/hooks/useUrlState';
import type { FleetSupplyRow, FleetSuppliesResponse, SuppliesSummaryResponse, SupplyKind, SupplyUrgency } from '../../../shared/types/supplies';

export interface ClientOption { id: string; name: string }
export type UrgencyFilter = SupplyUrgency | '';

const KINDS: readonly (SupplyKind | '')[] = ['', 'Tóner', 'Tambor de imagen', 'Fusor', 'Rodillo', 'Banda de transferencia', 'Depósito de residuos', 'Kit de mantenimiento', 'Otro'];
const URGENCIES: readonly UrgencyFilter[] = ['', 'critico', 'bajo', 'normal', 'sin_lectura'];

/** Filtros y página en la URL (auditoría 12/09/2026: antes sólo se leía `client_id`
 * una vez y nunca se escribía de vuelta; volver de un equipo reseteaba todo).
 * `client_id` conserva el nombre porque Cliente Detalle linkea `/supplies?client_id=`. */
const CODECS = { q: stringParam(), client_id: stringParam(), kind: enumParam(KINDS, ''), urgency: enumParam(URGENCIES, ''), page: pageParam };
type UrlFilters = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

function useFilterSetters(patch: UrlPatch<UrlFilters>) {
  return useMemo(() => ({
    setClientId: (client_id: string) => patch({ client_id, page: 0 }),
    setKind: (kind: SupplyKind | '') => patch({ kind, page: 0 }),
    setUrgency: (urgency: UrgencyFilter) => patch({ urgency, page: 0 }),
    setPage: (page: number) => patch({ page }),
  }), [patch]);
}

/** Alcance FIJO fuera de la URL (pestaña "Consumibles" de la ficha de cliente): el `?client_id=` se ignora. */
export interface SuppliesScope { clientId: string }

function useFilters(scope?: SuppliesScope) {
  const [url, patch] = useUrlState<UrlFilters>(CODECS);
  const { rawQuery, setRawQuery, effectiveQuery } = useUrlSearchQuery(url.q, (q) => patch({ q, page: 0 }));
  const setters = useFilterSetters(patch);
  return {
    rawQuery, setRawQuery, query: effectiveQuery,
    clientId: scope?.clientId ?? url.client_id, kind: url.kind, urgency: url.urgency, page: url.page,
    ...setters,
    ...(scope ? { setClientId: () => undefined } : {}),
  };
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

type RowsState = ReturnType<typeof useRowsState>;

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadSupplies(st: RowsState, f: Filters, page: number, pageSize: number, isLatest: () => boolean) {
  st.setLoading(true);
  st.setError('');
  try {
    const data = await api.get<FleetSuppliesResponse>(`/supplies?${buildSuppliesParams(f, page, pageSize).toString()}`);
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
  const fetchSupplies = useCallback(
    () => loadSupplies(st, f, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.query, f.clientId, f.kind, f.urgency, page, pageSize],
  );
  useEffect(() => { void fetchSupplies(); }, [fetchSupplies]);
  return { ...st, page, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), fetchSupplies };
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
export function useSuppliesPage(pageSize: number, scope?: SuppliesScope) {
  const { role } = useAuth();
  // Con alcance fijo no hay selector de cliente: la pestaña ya es el filtro.
  const canFilterByClient = !scope && (role === 'admin' || role === 'operator');
  const filters = useFilters(scope);
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
