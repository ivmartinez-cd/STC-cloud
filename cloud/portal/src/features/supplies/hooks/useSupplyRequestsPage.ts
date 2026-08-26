import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import type { SupplyRequest, SupplyRequestStats, SupplyRequestStatus } from '../types/supplyRequests';
import { PAGE_SIZE } from '../lib/supplyRequestsPresentation';

export interface ClientOption { id: string; name: string }
export type RequestTab = SupplyRequestStatus | 'all';
export const TABS: RequestTab[] = ['pending', 'reviewed', 'processed', 'completed', 'ignored', 'all'];

function useFilters() {
  const { clientId: ownClientId } = useAuth();
  const [clientId, setClientId] = useState(ownClientId ?? '');
  const [tab, setTab] = useState<RequestTab>('pending');
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [tab, clientId]);
  return { clientId, setClientId, tab, setTab, page, setPage };
}

type Filters = ReturnType<typeof useFilters>;

function useRowsState() {
  const [items, setItems] = useState<SupplyRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SupplyRequestStats | null>(null);
  const [loading, setLoading] = useState(true);
  return { items, setItems, total, setTotal, stats, setStats, loading, setLoading };
}

async function requestPage(f: Filters): Promise<{ list: { items: SupplyRequest[]; total: number }; stats: SupplyRequestStats }> {
  const listParams = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(f.page * PAGE_SIZE) });
  if (f.tab !== 'all') listParams.set('status', f.tab);
  if (f.clientId) listParams.set('client_id', f.clientId);
  const statsParams = f.clientId ? `?client_id=${f.clientId}` : '';
  const [list, stats] = await Promise.all([
    api.get<{ items: SupplyRequest[]; total: number }>(`/supply-requests?${listParams.toString()}`),
    api.get<SupplyRequestStats>(`/supply-requests/stats${statsParams}`),
  ]);
  return { list, stats };
}

function useRows(f: Filters) {
  const st = useRowsState();
  const load = useCallback(async () => {
    st.setLoading(true);
    try {
      const { list, stats } = await requestPage(f);
      st.setItems(list.items);
      st.setTotal(list.total);
      st.setStats(stats);
    } catch {
      st.setItems([]);
      st.setTotal(0);
    } finally {
      st.setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.tab, f.clientId, f.page]);
  useEffect(() => { void load(); }, [load]);
  return { ...st, totalPages: Math.max(1, Math.ceil(st.total / PAGE_SIZE)), reload: load };
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

export function useSupplyRequestsPage() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'operator';
  const filters = useFilters();
  const list = useRows(filters);
  const { clients, clientName } = useClients(canManage);
  const [detailId, setDetailId] = useState<string | null>(null);

  const duplicatePair = list.items.find((r) => r.possible_duplicate_of);
  const duplicateSibling = duplicatePair ? list.items.find((r) => r.id === duplicatePair.possible_duplicate_of) : undefined;

  return {
    canManage, clients, clientName, filters, ...list, countOf: countOfBuilder(list.stats),
    detailId, setDetailId, duplicatePair, duplicateSibling,
  };
}

export type SupplyRequestsPageState = ReturnType<typeof useSupplyRequestsPage>;
