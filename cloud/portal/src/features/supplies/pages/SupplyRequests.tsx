import { useState, useEffect, useCallback } from 'react';
import { Loader2, PackageSearch } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import SupplyRequestDetailModal from '../components/SupplyRequestDetailModal';
import {
  SUPPLY_REQUEST_STATUS_COLORS, SUPPLY_REQUEST_STATUS_LABELS,
  type SupplyRequest, type SupplyRequestStatus,
} from '../types/supplyRequests';

interface ClientOption { id: string; name: string; }

const TABS: (SupplyRequestStatus | 'all')[] = ['pending', 'reviewed', 'processed', 'completed', 'ignored', 'all'];

function fmtDate(v: string): string {
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Cola de pedidos de consumibles (Fase 4.2 del gap analysis vs HP SDS —
 * equivalente de las "Solicitudes de consumibles" del SDS, con los estados
 * como pestañas de filtro en vez de 6 subsecciones de menú).
 */
export default function SupplyRequests() {
  const { role, clientId: ownClientId } = useAuth();
  const canManage = role === 'admin' || role === 'operator';
  const [items, setItems] = useState<SupplyRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientFilter, setClientFilter] = useState(ownClientId ?? '');
  const [tab, setTab] = useState<SupplyRequestStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('status', tab);
    if (clientFilter) params.set('client_id', clientFilter);
    params.set('limit', '100');
    Promise.all([
      api.get<{ items: SupplyRequest[]; total: number }>(`/supply-requests?${params}`),
      api.get<Record<string, number>>(`/supply-requests/stats${clientFilter ? `?client_id=${clientFilter}` : ''}`),
    ])
      .then(([list, s]) => { setItems(list.items); setTotal(list.total); setStats(s); })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [tab, clientFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (canManage) api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, [canManage]);

  const countOf = (t: SupplyRequestStatus | 'all') =>
    t === 'all' ? Object.values(stats).reduce((a, b) => a + b, 0) : stats[t] ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
            <PackageSearch size={28} className="text-brand" /> Pedidos
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Solicitudes de consumibles — se abren solas al cruzar el umbral y se completan solas al detectar el reemplazo.
          </p>
        </div>
        {canManage && (
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
            className="bg-white text-slate-700 text-sm font-bold px-4 py-2.5 rounded-2xl border border-slate-200 outline-none focus:border-brand cursor-pointer">
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </header>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all ${
              tab === t ? 'bg-[#1a2333] text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
            }`}>
            {t === 'all' ? 'Todas' : SUPPLY_REQUEST_STATUS_LABELS[t]} · {countOf(t)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={28} className="text-brand animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-sm text-slate-400 font-medium">
          Sin pedidos en este estado.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Equipo', 'Consumible', 'SKU', 'Nivel', 'Origen', 'Estado', 'Apertura', 'Cierre'].map((h) => (
                  <th key={h} className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} className="hover:bg-slate-50/50 cursor-pointer">
                  <td className="py-3 px-4 font-bold text-slate-700">{r.device_serial ?? '—'}</td>
                  <td className="py-3 px-4 text-slate-600 font-medium">{r.description ?? `${r.supply_kind} ${r.supply_color ?? ''}`}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{r.sku ?? '—'}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{r.level_pct != null ? `${r.level_pct}%` : '—'}</td>
                  <td className="py-3 px-4 text-slate-500 font-bold uppercase text-[10px]">{r.origin === 'auto' ? 'Automático' : 'Manual'}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${SUPPLY_REQUEST_STATUS_COLORS[r.status]}`}>
                      {SUPPLY_REQUEST_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{fmtDate(r.opened_at)}</td>
                  <td className="py-3 px-4 text-slate-500 font-medium">{r.closed_at ? fmtDate(r.closed_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > items.length && (
            <p className="p-3 text-[10px] text-slate-400 font-bold text-center">Mostrando {items.length} de {total}</p>
          )}
        </div>
      )}

      <SupplyRequestDetailModal requestId={detailId} onClose={() => setDetailId(null)} onChanged={load} canManage={canManage} />
    </div>
  );
}
