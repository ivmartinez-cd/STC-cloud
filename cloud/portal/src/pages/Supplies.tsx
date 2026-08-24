import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Loader2, ChevronLeft, ChevronRight, Download, ShieldCheck, CheckSquare, Square } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtInt } from '../lib/supplies';
import { useRowSelection } from '../hooks/useRowSelection';
import BulkActionBar from '../components/BulkActionBar';
import type { FleetSupplyRow, FleetSuppliesResponse, SupplyKind } from '../types/supplies';

interface ClientOption { id: string; name: string; }

const PAGE_SIZE = 50;
const KINDS: SupplyKind[] = ['Tóner', 'Tambor de imagen', 'Fusor', 'Rodillo', 'Banda de transferencia', 'Depósito de residuos', 'Kit de mantenimiento', 'Otro'];

function levelBadge(pct: number | null): string {
  if (pct === null) return 'bg-slate-100 text-slate-400';
  if (pct <= 10) return 'bg-rose-100 text-rose-700';
  if (pct <= 20) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function exportSuppliesCSV(rows: FleetSupplyRow[]) {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const header = ['CLIENTE', 'MONITOR', 'SERIE', 'MODELO', 'TIPO', 'COLOR', 'DESCRIPCION', 'CODIGO', 'NIVEL_%', 'PAGINAS_RESTANTES', 'DIAS_RESTANTES', 'ULTIMA_LECTURA'].join(';');
  const rows_ = rows.map((r) => [
    r.client_name ?? '', r.agent_name ?? '', r.device_serial ?? '', r.device_model ?? '', r.kind, r.color,
    r.description, r.code ?? '', r.percentage ?? '', r.remainingPages ?? '', r.remainingDays ?? '', r.last_seen ?? '',
  ].join(';'));
  const blob = new Blob(['﻿' + [header, ...rows_].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consumibles_${today.replace(/\//g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const Supplies = () => {
  const { role } = useAuth();
  const canFilterByClient = role === 'admin' || role === 'operator';

  const [items, setItems] = useState<FleetSupplyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  const [clientId, setClientId] = useState('');
  const [kind, setKind] = useState('');
  const [maxDays, setMaxDays] = useState('');

  const fetchClients = useCallback(async () => {
    if (!canFilterByClient) return;
    try {
      const data = await api.get<ClientOption[]>('/clients');
      setClients(data);
    } catch {
      // Comodidad — si falla, se sigue pudiendo ver todo sin filtrar por cliente.
    }
  }, [canFilterByClient]);

  const fetchSupplies = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (clientId) params.set('client_id', clientId);
    if (kind) params.set('kind', kind);
    if (maxDays) params.set('max_days', maxDays);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    try {
      const data = await api.get<FleetSuppliesResponse>(`/supplies?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId, kind, maxDays, page]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchSupplies(); }, [fetchSupplies]);
  useEffect(() => { setPage(0); }, [clientId, kind, maxDays]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Selección múltiple (Fase 9 del gap analysis vs HP SDS) — sólo para exportar
  // la selección puntual; a diferencia de devices/alerts, acá no hay mutación
  // en bloque (no tiene sentido "dar de baja" o "reconocer" un consumible).
  const rowKey = (r: FleetSupplyRow) => `${r.device_id}-${r.key}`;
  const rowSelection = useRowSelection(items.map(rowKey));
  useEffect(() => { rowSelection.clear(); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportAll = async () => {
    const params = new URLSearchParams();
    if (clientId) params.set('client_id', clientId);
    if (kind) params.set('kind', kind);
    if (maxDays) params.set('max_days', maxDays);
    params.set('limit', '200');
    try {
      const data = await api.get<FleetSuppliesResponse>(`/supplies?${params.toString()}`);
      exportSuppliesCSV(data.items);
    } catch {
      exportSuppliesCSV(items);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
          <Droplets size={28} className="text-brand" /> Consumibles
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Tóners, tambores y kits de mantenimiento de toda la flota — {total} ítem(s) con los filtros actuales.
        </p>
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        {canFilterByClient && (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Todo tipo</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={maxDays} onChange={(e) => setMaxDays(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
          <option value="">Cualquier urgencia</option>
          <option value="7">≤ 7 días restantes</option>
          <option value="15">≤ 15 días restantes</option>
          <option value="30">≤ 30 días restantes</option>
        </select>
        <div className="flex-1" />
        <button onClick={handleExportAll} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-extrabold transition-all">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{error}</div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center animate-pulse">
          <Loader2 size={32} className="text-brand animate-spin mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando consumibles...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
          <ShieldCheck size={48} className="mb-3 text-emerald-500" />
          <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Sin resultados</h4>
          <p className="text-[10px] font-bold text-slate-400 mt-1">Ningún consumible con los filtros actuales</p>
        </div>
      ) : (
        <>
          <BulkActionBar count={rowSelection.count} onClear={rowSelection.clear}>
            <button
              onClick={() => exportSuppliesCSV(items.filter((r) => rowSelection.selected.has(rowKey(r))))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
            >
              <Download size={13} /> Exportar selección
            </button>
          </BulkActionBar>
        <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 w-8">
                  <button onClick={rowSelection.toggleAll} className="text-slate-400 hover:text-brand" title="Seleccionar todos">
                    {rowSelection.allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Sede</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Serie</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Color</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tipo</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Descripción</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">SKU</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nivel</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Pág. Restantes</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Días Restantes</th>
                <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Última Lectura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((r) => (
                <tr key={rowKey(r)} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-2.5 px-4">
                    <button onClick={() => rowSelection.toggle(rowKey(r))} className="text-slate-300 hover:text-brand">
                      {rowSelection.selected.has(rowKey(r)) ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-700 font-bold">
                    <Link to={`/devices/${r.device_id}`} className="hover:text-brand hover:underline">{r.client_name || '—'}</Link>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{r.agent_name || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] font-mono text-slate-600">{r.device_serial || '—'}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{r.device_model || '—'}</td>
                  <td className="py-2.5 px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-sm border border-slate-200 ${r.colorClass}`} />
                      <span className="text-[10px] font-bold text-slate-500">{r.color}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide">{r.kind}</td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{r.description}</td>
                  <td className="py-2.5 px-4 text-[10px] font-mono text-slate-400">{r.code || '—'}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black ${levelBadge(r.percentage)}`}>
                      {r.percentage === null ? '—' : `${Math.round(r.percentage)}%`}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600">{fmtInt(r.remainingPages)}</td>
                  <td className="py-2.5 px-4 text-[11px] font-bold text-slate-700">{r.remainingDays ?? '—'}</td>
                  <td className="py-2.5 px-4 text-[10px] text-slate-500 font-medium">{fmtDate(r.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Página {page + 1} de {totalPages}</span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 disabled:opacity-40 hover:bg-slate-100 transition-all">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Supplies;
