import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Lock, Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import type { PreviewLine, Closure, ClosureDetail } from '../types/reports';
import ReportsPreviewTable from '../components/ReportsPreviewTable';
import ReportsClosuresHistory from '../components/ReportsClosuresHistory';
import ReopenClosureModal from '../components/ReopenClosureModal';

interface ClientOption { id: string; name: string; }

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

  const downloadExport = (closureId: string, format: 'csv' | 'xlsx' | 'pdf') => {
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

      <ReportsPreviewTable period={period} totals={totals} previewLines={previewLines} previewLoading={previewLoading} previewError={previewError} />

      <ReportsClosuresHistory
        closures={closures}
        closuresLoading={closuresLoading}
        expandedId={expandedId}
        detail={detail}
        detailLoading={detailLoading}
        isReadOnlyViewer={isReadOnlyViewer}
        onToggleExpand={toggleExpand}
        onDownload={downloadExport}
        onReopenRequest={setReopenTarget}
      />

      {reopenTarget && (
        <ReopenClosureModal
          target={reopenTarget}
          reason={reopenReason}
          onReasonChange={setReopenReason}
          onCancel={() => { setReopenTarget(null); setReopenReason(''); }}
          onConfirm={handleReopen}
          reopening={reopening}
        />
      )}
    </div>
  );
};

export default Reports;
