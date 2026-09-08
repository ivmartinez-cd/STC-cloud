import { useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import { useRemoteActionsDirectory } from '../hooks/useRemoteActionsDirectory';
import { useRemoteActionsInsights } from '../hooks/useRemoteActionsInsights';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { exportRemoteActionsCsv } from '../lib/exportRemoteActionsCsv';
import RemoteActionsByTypeCard from '../components/remote-actions/RemoteActionsByTypeCard';
import DiagnosticBanner from '../components/remote-actions/DiagnosticBanner';
import RemoteActionsFilterBar from '../components/remote-actions/RemoteActionsFilterBar';
import RemoteActionsTable from '../components/remote-actions/RemoteActionsTable';
import RemoteActionsPagination from '../components/remote-actions/RemoteActionsPagination';
import CreateBatchModal from '../components/remote-actions/CreateBatchModal';
import BatchDetailModal from '../components/remote-actions/BatchDetailModal';
import type { RemoteActionBatchDetail, RemoteActionBatchRow } from '../types/remoteActions';
import { APP_LOCALE } from '../../../shared/lib/formatters';

/**
 * Rediseño hifi "Acciones remotas en bloque" (handoff "4 pantallas",
 * 25/08/2026) — Fase 4.6 del gap analysis vs HP SDS. Área de contenido
 * únicamente (sidebar/topbar son de `app/layout/`). Toda cifra derivada
 * (tira de métricas, resultado por tipo, banner de diagnóstico) viene de
 * `GET /remote-actions/summary` y `/remote-actions/by-type` — nunca
 * calculada acá.
 */
export default function RemoteActions() {
  const { showToast } = useToast();
  const fit = useFitRows({ estimate: 54 });
  const dir = useRemoteActionsDirectory(fit.rows);
  const insights = useRemoteActionsInsights();

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<RemoteActionBatchDetail | null>(null);
  const [exporting, setExporting] = useState(false);

  const openDetail = (b: RemoteActionBatchRow) => {
    api.get<RemoteActionBatchDetail>(`/remote-actions/${b.id}`).then(setDetail).catch(() => setDetail(null));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportRemoteActionsCsv(dir.effectiveQuery, dir.segment, dir.sortDir);
    } catch (err) {
      showToast('Error al exportar CSV: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setExporting(false);
    }
  };

  const diagnoseFailingType = () => {
    const failing = insights.byType?.diagnostic;
    if (failing) dir.setRawQuery(failing.label);
    dir.setSegment('con_errores');
  };

  return (
    <div className="-m-4 min-w-0 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <div className="mb-[22px] flex flex-wrap items-end short:mb-3 justify-between gap-4">
        <div>
          <div className="mb-2.5 flex items-center gap-3 short:mb-1.5">
            <span className="block h-0.5 w-5 bg-brand" />
            <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">
              ACCIONES REMOTAS EN BLOQUE SOBRE LOS MONITORES
            </span>
          </div>
          <h1 className="m-0 font-montserrat text-[34px] font-extrabold short:text-[26px] leading-[1.05] tracking-[-.018em] text-ink-900">
            Acciones
          </h1>
          {insights.summary && (
            <p className="mt-2.5 font-sans text-[12.5px] text-ink-400">
              {insights.summary.total_all_time.toLocaleString(APP_LOCALE)} lotes ejecutados · programadas y con seguimiento por lote
            </p>
          )}
        </div>
        <div className="flex gap-2.5">
          <button
            type="button" onClick={handleExport} disabled={exporting}
            className="rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            {exporting ? 'EXPORTANDO…' : 'EXPORTAR'}
          </button>
          <button
            type="button" onClick={() => setCreateOpen(true)}
            className="rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            + NUEVA ACCIÓN
          </button>
        </div>
      </div>

      <div className="mb-4 short:mb-3 grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
        <RemoteActionsByTypeCard
          byType={insights.byType} loading={insights.byTypeLoading} error={insights.byTypeError} onRetry={insights.refetchByType}
        />
      </div>

      {insights.byType?.diagnostic && (
        <div className="mb-4">
          <DiagnosticBanner diagnostic={insights.byType.diagnostic} onDiagnose={diagnoseFailingType} />
        </div>
      )}

      {/* Sólo esta tarjeta crece: la tira de métricas, "por tipo" y el banner
          de diagnóstico de arriba conservan su alto fijo. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <RemoteActionsFilterBar
          query={dir.rawQuery} onQueryChange={dir.setRawQuery}
          segment={dir.segment} onSegmentChange={dir.setSegment}
          sortDir={dir.sortDir}
        />

        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <RemoteActionsTable
            rows={dir.rows} loading={dir.loading} error={dir.error} onRetry={dir.refetch}
            sortDir={dir.sortDir} onToggleSort={dir.toggleSortDir}
            onRowClick={openDetail} hasActiveFilters={dir.hasActiveFilters} onClearFilters={dir.clearFilters}
            skeletonRows={fit.rows}
          />
        </div>

        {!dir.error && !dir.loading && (
          <RemoteActionsPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} pageSize={dir.pageSize} onPageChange={dir.setPage} />
        )}
      </div>

      <CreateBatchModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={dir.refetch} />
      <BatchDetailModal detail={detail} onClose={() => setDetail(null)} onCancelled={dir.refetch} />
    </div>
  );
}
