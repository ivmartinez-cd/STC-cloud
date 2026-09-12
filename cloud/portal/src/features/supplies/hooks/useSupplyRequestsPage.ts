import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { clampPage } from '../../../shared/lib/clampPage';
import { useUrlState, enumParam, stringParam, pageParam, type UrlPatch } from '../../../shared/hooks/useUrlState';
import type { SupplyRequest, SupplyRequestStats, SupplyRequestStatus } from '../types/supplyRequests';

export interface ClientOption { id: string; name: string }
export type RequestTab = SupplyRequestStatus | 'all';
export const TABS: RequestTab[] = ['pending', 'reviewed', 'processed', 'completed', 'ignored', 'all'];

/** Pestaña, cliente, página y el pedido abierto (`?request=<id>`) en la URL
 * (auditoría 12/09/2026): un link a un pedido concreto es compartible (mail,
 * banner de duplicados) y F5 no cierra el modal ni vuelve a "Pendientes". */
const CODECS = { tab: enumParam(TABS, 'pending'), client_id: stringParam(), page: pageParam, request: stringParam() };
type UrlFilters = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

function useFilterSetters(patch: UrlPatch<UrlFilters>) {
  return useMemo(() => ({
    setClientId: (client_id: string) => patch({ client_id, page: 0 }),
    setTab: (tab: RequestTab) => patch({ tab, page: 0 }),
    setPage: (page: number) => patch({ page }),
    // Abrir un pedido apila (es una "entidad abierta": "atrás" lo cierra); cerrar reemplaza.
    setDetailId: (id: string | null) => (id ? patch({ request: id }, { push: true }) : patch({ request: '' })),
  }), [patch]);
}

function useFilters() {
  const { clientId: ownClientId } = useAuth();
  const [url, patch] = useUrlState<UrlFilters>(CODECS);
  // Un client_viewer siempre ve el suyo (el backend scopea igual); sin `?client_id=` no se escribe el default.
  return { clientId: ownClientId || url.client_id, tab: url.tab, page: url.page, detailId: url.request || null, ...useFilterSetters(patch) };
}

type Filters = ReturnType<typeof useFilters>;

function useRowsState() {
  const [items, setItems] = useState<SupplyRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SupplyRequestStats | null>(null);
  const [loading, setLoading] = useState(true);
  return { items, setItems, total, setTotal, stats, setStats, loading, setLoading };
}

type RowsState = ReturnType<typeof useRowsState>;

async function requestPage(f: Filters, page: number, pageSize: number): Promise<{ list: { items: SupplyRequest[]; total: number }; stats: SupplyRequestStats }> {
  const listParams = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (f.tab !== 'all') listParams.set('status', f.tab);
  if (f.clientId) listParams.set('client_id', f.clientId);
  const statsParams = f.clientId ? `?client_id=${f.clientId}` : '';
  const [list, stats] = await Promise.all([
    api.get<{ items: SupplyRequest[]; total: number }>(`/supply-requests?${listParams.toString()}`),
    api.get<SupplyRequestStats>(`/supply-requests/stats${statsParams}`),
  ]);
  return { list, stats };
}

/** `isLatest`: respuestas de un request ya superado no tocan la tabla (`useLatestRequest`). */
async function loadRows(st: RowsState, f: Filters, page: number, pageSize: number, isLatest: () => boolean) {
  st.setLoading(true);
  try {
    const { list, stats } = await requestPage(f, page, pageSize);
    if (!isLatest()) return;
    st.setItems(list.items);
    st.setTotal(list.total);
    st.setStats(stats);
  } catch {
    if (!isLatest()) return;
    st.setItems([]);
    st.setTotal(0);
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useRows(f: Filters, pageSize: number) {
  const st = useRowsState();
  const beginRequest = useLatestRequest();
  // `?page=` acotada al mostrar/pedir, sin persistir el clamp (ver `clampPage`).
  const page = clampPage(f.page, pageSize, st.total);
  const load = useCallback(
    () => loadRows(st, f, page, pageSize, beginRequest()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.tab, f.clientId, page, pageSize],
  );
  useEffect(() => { void load(); }, [load]);
  return { ...st, page, pageSize, totalPages: Math.max(1, Math.ceil(st.total / pageSize)), reload: load };
}

function countOfBuilder(stats: SupplyRequestStats | null) {
  return (t: RequestTab): number => {
    if (!stats) return 0;
    if (t === 'all') return Object.entries(stats).filter(([k]) => k !== 'window').reduce((a, [, v]) => a + (v as number), 0);
    return (stats[t] as number | undefined) ?? 0;
  };
}

function useClients(canManage: boolean) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  useEffect(() => {
    if (canManage) api.get<ClientOption[]>('/clients').then(setClients).catch(() => { /* comodidad */ });
  }, [canManage]);
  return { clients, clientName: (id: string) => clients.find((c) => c.id === id)?.name ?? '…' };
}

/** `pageSize` = filas que entran en pantalla (`useFitRows`, 27/08/2026). */
export function useSupplyRequestsPage(pageSize: number) {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'operator';
  const filters = useFilters();
  const list = useRows(filters, pageSize);
  const { clients, clientName } = useClients(canManage);

  const duplicatePair = list.items.find((r) => r.possible_duplicate_of);
  const duplicateSibling = duplicatePair ? list.items.find((r) => r.id === duplicatePair.possible_duplicate_of) : undefined;

  return {
    canManage, clients, clientName, filters, ...list, countOf: countOfBuilder(list.stats),
    detailId: filters.detailId, setDetailId: filters.setDetailId, duplicatePair, duplicateSibling,
  };
}

export type SupplyRequestsPageState = ReturnType<typeof useSupplyRequestsPage>;
