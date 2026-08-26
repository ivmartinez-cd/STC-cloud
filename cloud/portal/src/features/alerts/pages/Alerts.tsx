import { useState } from 'react';
import PageHeader from '../../../shared/components/PageHeader';
import CreateIncidentModal from '../../../shared/components/CreateIncidentModal';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { fmt } from '../../../shared/lib/formatters';
import type { Alert } from '../../../shared/types/alerts';
import { useAlertsPage, deriveIncidentContext, type AlertsPageState } from '../hooks/useAlertsPage';
import { exportAlertsCsv } from '../lib/exportAlertsCsv';
import AlertsMetricsPanel from '../components/AlertsMetricsPanel';
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
  const s = useAlertsPage();
  const [exporting, setExporting] = useState(false);
  const incident = useIncidentModal(s);

  const handleExport = async () => {
    setExporting(true);
    try { await exportAlertsCsv(s.filters); } finally { setExporting(false); }
  };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <PageHeader
        eyebrow="TÓNER · RESETS DE CONTADOR · EQUIPOS SIN SEÑAL" title="Alertas" subtitle={subtitle(s.summary)}
        actions={<HeaderActions s={s} exporting={exporting} onExport={handleExport} />}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AlertsMetricsPanel summary={s.summary} loading={s.summaryLoading} error={s.summaryError} onRetry={s.fetchSummary} />
        <AlertsByCodePanel byCode={s.summary?.byCode ?? []} total={s.summary?.total ?? 0} loading={s.summaryLoading} error={s.summaryError} onRetry={s.fetchSummary} />
      </div>

      <div className="rounded-[5px] border border-line-100 bg-white">
        <AlertsFilterBar filters={s.filters} />
        {!s.isReadOnlyViewer && (
          <AlertsBulkBar
            count={s.rowSelection.count} busy={s.bulkBusy} groupByCode={s.groupByCode}
            onAcknowledge={s.bulkAcknowledge} onOpenIncident={() => incident.setBulkOpen(true)}
            onToggleGroupByCode={() => s.setGroupByCode(!s.groupByCode)} onClear={s.rowSelection.clear}
          />
        )}
        <AlertsTable
          alerts={s.alerts} classLabels={s.classLabels} readOnly={s.isReadOnlyViewer} selection={s.rowSelection}
          pendingId={s.pendingId} groupByCode={s.groupByCode} loading={s.loading} error={s.error} onRetry={s.fetchAlerts}
          onUpdate={s.updateAlert} onCreateIncident={incident.setRowAlert}
        />
        <AlertsPagination page={s.page} total={s.total} totalPages={s.totalPages} onChange={s.setPage} />
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
