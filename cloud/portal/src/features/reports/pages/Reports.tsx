import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Download, FileSpreadsheet, Lock, Unlock, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Loader2, X,
} from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import type { PreviewLine, Closure, ClosureDetail } from '../types/reports';

interface ClientOption { id: string; name: string; }

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const Reports = () => {
  const { role, clientId: ownClientId } = useAuth();
  const { showToast } = useToast();
  // client_viewer sólo ve sus propios cierres — ni el selector de cliente ni el
  // botón de cierre/reapertura tienen sentido para ese rol (el backend igual
  // los rechaza con 403, esto sólo evita mandar la request para nada).
  const isReadOnlyViewer = role === 'client_viewer';

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(ownClientId ?? '');
  const [period, setPeriod] = useState(currentPeriod());

  const [previewLines, setPreviewLines] = useState<PreviewLine[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [closing, setClosing] = useState(false);

  const [closures, setClosures] = useState<Closure[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosureDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [reopenTarget, setReopenTarget] = useState<Closure | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const fetchClients = useCallback(async () => {
    if (isReadOnlyViewer) return;
    try {
      const data = await api.get<ClientOption[]>('/clients');
      setClients(data);
      setSelectedClientId((prev) => prev || data[0]?.id || '');
    } catch {
      // El selector de cliente es una comodidad — si falla, no bloquea el resto.
    }
  }, [isReadOnlyViewer]);

  const fetchPreview = useCallback(async () => {
    if (!selectedClientId) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const data = await api.get<{ period: string; lines: PreviewLine[] }>(
        `/clients/${selectedClientId}/reports/preview?period=${period}`
      );
      setPreviewLines(data.lines);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedClientId, period]);

  const fetchClosures = useCallback(async () => {
    if (!selectedClientId) return;
    setClosuresLoading(true);
    try {
      const data = await api.get<Closure[]>(`/clients/${selectedClientId}/reports`);
      setClosures(data);
    } catch {
      setClosures([]);
    } finally {
      setClosuresLoading(false);
    }
  }, [selectedClientId]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);
  useEffect(() => { void fetchPreview(); }, [fetchPreview]);
  useEffect(() => { void fetchClosures(); }, [fetchClosures]);

  const totals = useMemo(() => previewLines.reduce(
    (acc, l) => ({
      total: acc.total + Number(l.delta_total),
      mono: acc.mono + Number(l.delta_mono),
      color: acc.color + Number(l.delta_color),
    }),
    { total: 0, mono: 0, color: 0 }
  ), [previewLines]);

  const alreadyClosed = closures.some((c) => c.period.startsWith(period) && c.status === 'closed');

  const handleClose = async () => {
    if (!selectedClientId) return;
    setClosing(true);
    try {
      await api.post(`/clients/${selectedClientId}/reports/close`, { period });
      showToast(`Período ${period} cerrado`, 'success');
      await fetchClosures();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al cerrar el período', 'error');
    } finally {
      setClosing(false);
    }
  };

  const toggleExpand = async (closure: Closure) => {
    if (expandedId === closure.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(closure.id);
    setDetailLoading(true);
    try {
      const data = await api.get<ClosureDetail>(`/clients/${selectedClientId}/reports/${closure.id}`);
      setDetail(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al cargar el detalle', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenTarget) return;
    setReopening(true);
    try {
      await api.post(`/clients/${selectedClientId}/reports/${reopenTarget.id}/reopen`, { reason: reopenReason.trim() || undefined });
      showToast('Cierre reabierto', 'success');
      setReopenTarget(null);
      setReopenReason('');
      await fetchClosures();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al reabrir', 'error');
    } finally {
      setReopening(false);
    }
  };

  const downloadExport = (closureId: string, format: 'csv' | 'xlsx') => {
    window.open(`/api/v1/clients/${selectedClientId}/reports/${closureId}/export.${format}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
          <FileText size={28} className="text-brand" /> Reportes de Facturación
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Cierre mensual inmutable por cliente: lectura inicial/final, delta y fuente por equipo.
        </p>
      </header>

      <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
        {!isReadOnlyViewer && (
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer">
            <option value="">Seleccionar cliente…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
        {!isReadOnlyViewer && (
          <button
            onClick={handleClose}
            disabled={closing || !selectedClientId || alreadyClosed}
            title={alreadyClosed ? 'Este período ya está cerrado — reabrilo primero si necesitás uno nuevo' : undefined}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {closing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {alreadyClosed ? 'Período cerrado' : 'Cerrar período'}
          </button>
        )}
      </div>

      {/* Preview del período seleccionado */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-brand/5 overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Vista previa — {period}</h3>
          <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
            <span>Total: <span className="text-[#1a2333] font-black">{totals.total.toLocaleString()}</span></span>
            <span>Mono: {totals.mono.toLocaleString()}</span>
            <span>Color: {totals.color.toLocaleString()}</span>
          </div>
        </header>
        {previewError && <div className="p-4 text-xs font-medium text-rose-600 bg-rose-50">{previewError}</div>}
        {previewLoading ? (
          <div className="h-32 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-brand" /></div>
        ) : previewLines.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            Sin equipos o sin lecturas en este período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Equipo</th>
                  <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Lectura inicial</th>
                  <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Lectura final</th>
                  <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Delta</th>
                  <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fuente</th>
                  <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {previewLines.map((l) => (
                  <tr key={l.device_id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-4 text-[11px]">
                      <Link to={`/devices/${l.device_id}`} className="font-bold text-slate-700 hover:text-brand hover:underline">
                        {l.model || l.serial_number || 'Equipo'}
                      </Link>
                      <div className="text-[9px] text-slate-400 font-mono">{l.serial_number}</div>
                    </td>
                    <td className="py-2 px-4 text-[11px] text-slate-600">
                      {l.first_total ?? '—'} <span className="text-slate-400">({fmtDate(l.first_reading_at)})</span>
                    </td>
                    <td className="py-2 px-4 text-[11px] text-slate-600">
                      {l.last_total ?? '—'} <span className="text-slate-400">({fmtDate(l.last_reading_at)})</span>
                    </td>
                    <td className="py-2 px-4 text-[11px] font-black text-[#1a2333]">{Number(l.delta_total).toLocaleString()}</td>
                    <td className="py-2 px-4 text-[10px] text-slate-500 uppercase">{l.source ?? '—'}</td>
                    <td className="py-2 px-4">
                      {l.had_counter_reset && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">
                          <AlertTriangle size={10} /> Reset de contador
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de cierres */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-brand/5 overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Historial de cierres</h3>
        </header>
        {closuresLoading ? (
          <div className="h-24 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-brand" /></div>
        ) : closures.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            Sin cierres todavía
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {closures.map((c) => (
              <div key={c.id}>
                <div className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50/50">
                  <button onClick={() => toggleExpand(c)} className="text-slate-400 hover:text-brand">
                    {expandedId === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <span className="text-xs font-black text-[#1a2333] w-20">{c.period.slice(0, 7)}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                    c.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {c.status === 'closed' ? <CheckCircle2 size={10} /> : <Unlock size={10} />}
                    {c.status === 'closed' ? 'Cerrado' : 'Reabierto'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">{fmtDate(c.closed_at)}</span>
                  <span className="text-[11px] font-black text-slate-700 ml-auto">{Number(c.total_pages).toLocaleString()} págs.</span>
                  <button onClick={() => downloadExport(c.id, 'csv')} title="Descargar CSV"
                    className="p-2 bg-slate-50 text-slate-500 hover:text-brand hover:bg-brand/10 rounded-xl transition-all">
                    <Download size={14} />
                  </button>
                  <button onClick={() => downloadExport(c.id, 'xlsx')} title="Descargar XLSX"
                    className="p-2 bg-slate-50 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
                    <FileSpreadsheet size={14} />
                  </button>
                  {!isReadOnlyViewer && c.status === 'closed' && (
                    <button onClick={() => setReopenTarget(c)} title="Reabrir"
                      className="p-2 bg-slate-50 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all">
                      <Unlock size={14} />
                    </button>
                  )}
                </div>
                {expandedId === c.id && (
                  <div className="px-6 pb-4 bg-slate-50/50">
                    {detailLoading ? (
                      <div className="py-6 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-brand" /></div>
                    ) : detail && detail.id === c.id ? (
                      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white mt-2">
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Serie</th>
                              <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                              <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Monitor</th>
                              <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Delta</th>
                              <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Fuente</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {detail.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="py-1.5 px-3 text-[10px] font-mono text-slate-600">{l.device_serial ?? '—'}</td>
                                <td className="py-1.5 px-3 text-[10px] text-slate-700 font-bold">{l.device_model ?? '—'}</td>
                                <td className="py-1.5 px-3 text-[10px] text-slate-500">{l.agent_name ?? '—'}</td>
                                <td className="py-1.5 px-3 text-[10px] font-black text-[#1a2333]">{Number(l.delta_total).toLocaleString()}</td>
                                <td className="py-1.5 px-3 text-[10px] text-slate-400 uppercase">{l.source ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal reabrir */}
      {reopenTarget && (
        <div className="fixed inset-0 bg-[#0c111d]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-8 border border-slate-100 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><RefreshCw size={22} /></div>
              <div>
                <h3 className="text-lg font-extrabold text-[#1a2333]">Reabrir cierre</h3>
                <p className="text-xs text-slate-500 font-medium">Período {reopenTarget.period.slice(0, 7)}</p>
              </div>
            </div>
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Motivo (opcional)</label>
            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3}
              className="cd-input w-full mt-2 mb-6 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm" />
            <div className="flex items-center gap-3">
              <button onClick={() => { setReopenTarget(null); setReopenReason(''); }} disabled={reopening}
                className="flex-1 px-5 py-3 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2">
                <X size={14} /> Cancelar
              </button>
              <button onClick={handleReopen} disabled={reopening}
                className="flex-1 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {reopening ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />} Reabrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
