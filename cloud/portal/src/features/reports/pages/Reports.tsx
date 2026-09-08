import { useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import PageHeader from '../../../shared/components/PageHeader';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import type { Closure } from '../types/reports';
import { useReportsPage, type ReportsPageState } from '../hooks/useReportsPage';
import { useReportsDetailPaging } from '../hooks/useReportsDetailPaging';
import ReportsPeriodBar from '../components/ReportsPeriodBar';
import ReportsAnomalyBanner from '../components/ReportsAnomalyBanner';
import ReportsDetailTable from '../components/ReportsDetailTable';
import ReportsClosuresHistory from '../components/ReportsClosuresHistory';
import ReopenClosureModal from '../components/ReopenClosureModal';

function downloadExport(clientId: string, closureId: string, format: 'csv' | 'xlsx' | 'pdf') {
  window.open(`/api/v1/clients/${clientId}/reports/${closureId}/export.${format}`, '_blank');
}

function HeaderActions({ s }: { s: ReportsPageState }) {
  if (s.closure?.status === 'closed') {
    return (
      <>
        <button type="button" onClick={() => downloadExport(s.selectedClientId, s.closure!.id, 'csv')} className={BTN_SECONDARY_LG}>EXPORTAR CSV</button>
        <button type="button" onClick={() => downloadExport(s.selectedClientId, s.closure!.id, 'pdf')} className={BTN_PRIMARY_LG}>DESCARGAR PDF</button>
      </>
    );
  }
  if (s.canManage) {
    return <button type="button" onClick={s.close} disabled={s.closing || !s.selectedClientId} className={BTN_PRIMARY_LG}>{s.closing ? 'CERRANDO…' : 'CERRAR PERÍODO'}</button>;
  }
  return null;
}

async function requestReopen(s: ReportsPageState, target: Closure, reason: string): Promise<void> {
  await api.post(`/clients/${s.selectedClientId}/reports/${target.id}/reopen`, { reason: reason.trim() || undefined });
  void s.fetchClosures();
  void s.fetchRows();
}

function useReopenModalState() {
  const [target, setTarget] = useState<Closure | null>(null);
  const [reason, setReason] = useState('');
  const [reopening, setReopening] = useState(false);
  return { target, setTarget, reason, setReason, reopening, setReopening };
}

function useReopenModal(s: ReportsPageState) {
  const { showToast } = useToast();
  const st = useReopenModalState();
  const confirm = async () => {
    if (!st.target) return;
    st.setReopening(true);
    try {
      await requestReopen(s, st.target, st.reason);
      showToast('Cierre reabierto', 'success');
      st.setTarget(null);
      st.setReason('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al reabrir', 'error');
    } finally {
      st.setReopening(false);
    }
  };
  const cancel = () => { st.setTarget(null); st.setReason(''); };
  return { ...st, confirm, cancel };
}

function Reports() {
  const s = useReportsPage();
  const paging = useReportsDetailPaging(s.rows);
  const reopen = useReopenModal(s);

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="CIERRE MENSUAL INMUTABLE POR CLIENTE" title="Reportes de facturación"
        subtitle="Lectura inicial y final, delta y fuente por equipo. Una vez cerrado el período, los valores no se recalculan: quedan como respaldo de lo facturado."
        actions={<HeaderActions s={s} />}
      />

      <ReportsPeriodBar s={s} />

      {!s.selectedClientId ? (
        <div className="rounded-[5px] border border-line-100 bg-white py-16 text-center font-sans text-[13px] text-ink-300">Seleccioná un cliente para ver su facturación.</div>
      ) : (
        <>
          <ReportsAnomalyBanner rows={s.rows} onViewCalc={() => paging.setFilter('anomaly')} />
          <ReportsDetailTable period={s.period} rows={s.rows} paging={paging} loading={s.loading} error={s.error} onRetry={s.fetchRows} />
          <ReportsClosuresHistory
            closures={s.closures} closuresLoading={s.closuresLoading} activePeriod={s.period} isReadOnlyViewer={s.isReadOnlyViewer}
            onSelectPeriod={s.setPeriod} onDownload={(id, fmt) => downloadExport(s.selectedClientId, id, fmt)} onReopenRequest={reopen.setTarget}
          />
        </>
      )}

      {reopen.target && (
        <ReopenClosureModal target={reopen.target} reason={reopen.reason} onReasonChange={reopen.setReason} onCancel={reopen.cancel} onConfirm={reopen.confirm} reopening={reopen.reopening} />
      )}
    </div>
  );
}

export default Reports;
