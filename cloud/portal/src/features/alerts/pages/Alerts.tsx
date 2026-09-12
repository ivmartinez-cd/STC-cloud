import { useState } from 'react';
import PageHeader from '../../../shared/components/PageHeader';
import CreateIncidentModal from '../../../shared/components/CreateIncidentModal';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { fmt } from '../../../shared/lib/formatters';
import type { Alert } from '../../../shared/types/alerts';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useAlertsPage, deriveIncidentContext, type AlertsPageState } from '../hooks/useAlertsPage';
import { exportAlertsCsv } from '../lib/exportAlertsCsv';
import AlertsByCodePanel from '../components/AlertsByCodePanel';
import AlertsFilterBar from '../components/AlertsFilterBar';
import AlertsBulkBar from '../components/AlertsBulkBar';
import AlertsTable from '../components/AlertsTable';
import AlertsPagination from '../components/AlertsPagination';

function subtitle(s: AlertsPageState['summary']): string {
  if (!s) return '';
  return `${fmt(s.total)} sin resolver · ${fmt(s.bySeverity.critical)} críticas y ${fmt(s.bySeverity.warning)} advertencias · ${fmt(s.total)} sin reconocer`;
}

function HeaderActions({ s, exporting, onExport }: { s: AlertsPageState; exporting: boolean; onExport: () => void }) {
  return (
    <>
      <button type="button" onClick={onExport} disabled={exporting} className={BTN_SECONDARY_LG}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR'}</button>
      {!s.isReadOnlyViewer && (
        <button type="button" onClick={s.acknowledgeAllVisible} disabled={s.bulkBusy} className={BTN_PRIMARY_LG}>RECONOCER TODAS</button>
      )}
    </>
  );
}

/** Incidente manual: fila puntual (`rowAlert`) o selección en bloque (`bulkIds`) —
 * mismo modal, contexto distinto. Nunca ambos a la vez. */
function useIncidentModal(s: AlertsPageState) {
  const [rowAlert, setRowAlert] = useState<Alert | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkAlerts = bulkOpen ? s.selectedAlerts() : [];
  const isOpen = !!rowAlert || bulkOpen;
  const close = () => { setRowAlert(null); setBulkOpen(false); };
  const ctx = rowAlert
    ? { clientId: rowAlert.client_id ?? undefined, deviceId: rowAlert.device_id ?? undefined, alertClass: rowAlert.alert_class ?? undefined, alertIds: [rowAlert.id] }
    : { ...deriveIncidentContext(bulkAlerts), alertIds: bulkAlerts.map((a) => a.id) };
  return { rowAlert, setRowAlert, bulkOpen, setBulkOpen, isOpen, close, ctx };
}

function Alerts() {
  // "Agrupar por código" intercala cabeceras de grupo: se descuentan 2 filas
  // del cálculo sólo mientras está activo, si no la lista quedaría corta.
  const [groupByCode, setGroupByCode] = useState(false);
  const fit = useFitRows({ estimate: 54, reserveRows: groupByCode ? 2 : 0 });
  const s = useAlertsPage(fit.rows);
  const [exporting, setExporting] = useState(false);
  const incident = useIncidentModal(s);

  const handleExport = async () => {
    setExporting(true);
    try { await exportAlertsCsv(s.filters); } finally { setExporting(false); }
  };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="TÓNER · RESETS DE CONTADOR · EQUIPOS SIN SEÑAL" title="Alertas" subtitle={subtitle(s.summary)}
        actions={<HeaderActions s={s} exporting={exporting} onExport={handleExport} />}
      />

      <div className="mb-4 short:mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AlertsByCodePanel byCode={s.summary?.byCode ?? []} total={s.summary?.total ?? 0} loading={s.summaryLoading} error={s.summaryError} onRetry={s.fetchSummary} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <AlertsFilterBar filters={s.filters} rows={s.alerts} classLabels={s.classLabels} />
        {!s.isReadOnlyViewer && (
          <AlertsBulkBar
            count={s.rowSelection.count} busy={s.bulkBusy} groupByCode={groupByCode}
            onAcknowledge={s.bulkAcknowledge} onOpenIncident={() => incident.setBulkOpen(true)}
            onToggleGroupByCode={() => setGroupByCode(!groupByCode)} onClear={s.rowSelection.clear}
          />
        )}
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <AlertsTable
            alerts={s.alerts} classLabels={s.classLabels} readOnly={s.isReadOnlyViewer} selection={s.rowSelection}
            pendingId={s.pendingId} groupByCode={groupByCode} loading={s.loading} error={s.error} onRetry={s.fetchAlerts}
            onUpdate={s.updateAlert} onCreateIncident={incident.setRowAlert} skeletonRows={fit.rows}
          />
        </div>
        <AlertsPagination page={s.page} total={s.total} totalPages={s.totalPages} pageSize={s.pageSize} onChange={s.setPage} />
      </div>

      <CreateIncidentModal
        isOpen={incident.isOpen} onClose={incident.close}
        onCreated={() => { void s.fetchAlerts(); }} clients={s.clients}
        initialClientId={incident.ctx.clientId} initialDeviceId={incident.ctx.deviceId}
        initialClass={incident.ctx.alertClass} initialAlertIds={incident.ctx.alertIds}
      />
    </div>
  );
}

export default Alerts;
