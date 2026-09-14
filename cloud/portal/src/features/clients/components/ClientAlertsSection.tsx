import { useState } from 'react';
import { Link } from 'react-router-dom';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import CreateIncidentModal from '../../../shared/components/CreateIncidentModal';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useReturnParam } from '../../../shared/hooks/useReturnParam';
import { fmt } from '../../../shared/lib/formatters';
import { useAlertsPage, type AlertsPageState } from '../../alerts/hooks/useAlertsPage';
import { useIncidentModal } from '../../alerts/hooks/useIncidentModal';
import AlertsFilterBar from '../../alerts/components/AlertsFilterBar';
import AlertsBulkBar from '../../alerts/components/AlertsBulkBar';
import AlertsTable from '../../alerts/components/AlertsTable';
import AlertsPagination from '../../alerts/components/AlertsPagination';

const LINK = 'font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline';

/** Rótulo + salida a la pantalla completa (con `from=` para volver acá tal cual). */
function AlertsToolbar({ clientId, s }: { clientId: string; s: AlertsPageState }) {
  const returnParam = useReturnParam();
  const total = s.summary?.total ?? 0;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3.5">
      <ZoneLabel text={`Alertas · ${fmt(total)} sin resolver`} lineColorClass="bg-brand-gray" />
      <Link to={`/alerts?client_id=${clientId}&${returnParam}`} className={LINK}>Ver en Alertas →</Link>
    </div>
  );
}

/**
 * Pestaña "Alertas" de la ficha de cliente: la MISMA tabla, filtros y acciones
 * de la pantalla de Alertas, con el alcance fijo en este cliente (auditoría
 * de navegación, 14/09/2026 — antes era un cartel con un botón que sacaba al
 * operador de la ficha). El chip "Cliente" no se muestra: el filtro es la
 * pestaña y no se puede quitar.
 */
export default function ClientAlertsSection({ clientId }: { clientId: string }) {
  const [groupByCode, setGroupByCode] = useState(false);
  const fit = useFitRows({ estimate: 54, reserveRows: groupByCode ? 2 : 0 });
  const s = useAlertsPage(fit.rows, { clientId });
  const incident = useIncidentModal(s);
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3.5">
      <AlertsToolbar clientId={clientId} s={s} />
      <AlertsCard s={s} fit={fit} groupByCode={groupByCode} onToggleGroupByCode={() => setGroupByCode(!groupByCode)} incident={incident} />
      <CreateIncidentModal
        isOpen={incident.isOpen} onClose={incident.close} onCreated={() => { void s.fetchAlerts(); }} clients={s.clients}
        initialClientId={incident.ctx.clientId ?? clientId} initialDeviceId={incident.ctx.deviceId}
        initialClass={incident.ctx.alertClass} initialAlertIds={incident.ctx.alertIds}
      />
    </section>
  );
}

type Incident = ReturnType<typeof useIncidentModal>;
type Fit = ReturnType<typeof useFitRows>;

/** La tarjeta: filtros (sin el chip "Cliente"), barra de selección, tabla y paginación — igual que en la pantalla de Alertas. */
function AlertsCard({ s, fit, groupByCode, onToggleGroupByCode, incident }: { s: AlertsPageState; fit: Fit; groupByCode: boolean; onToggleGroupByCode: () => void; incident: Incident }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
      <AlertsFilterBar filters={{ ...s.filters, clientId: '' }} rows={s.alerts} classLabels={s.classLabels} />
      {!s.isReadOnlyViewer && (
        <AlertsBulkBar
          count={s.rowSelection.count} busy={s.bulkBusy} groupByCode={groupByCode}
          onAcknowledge={s.bulkAcknowledge} onOpenIncident={() => incident.setBulkOpen(true)}
          onToggleGroupByCode={onToggleGroupByCode} onClear={s.rowSelection.clear}
        />
      )}
      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        <ScopedAlertsTable s={s} groupByCode={groupByCode} skeletonRows={fit.rows} onCreateIncident={incident.setRowAlert} />
      </div>
      <AlertsPagination page={s.page} total={s.total} totalPages={s.totalPages} pageSize={s.pageSize} onChange={s.setPage} />
    </div>
  );
}

function ScopedAlertsTable({ s, groupByCode, skeletonRows, onCreateIncident }: { s: AlertsPageState; groupByCode: boolean; skeletonRows: number; onCreateIncident: Incident['setRowAlert'] }) {
  return (
    <AlertsTable
      alerts={s.alerts} classLabels={s.classLabels} readOnly={s.isReadOnlyViewer} selection={s.rowSelection}
      pendingId={s.pendingId} groupByCode={groupByCode} loading={s.loading} error={s.error} onRetry={s.fetchAlerts}
      onUpdate={s.updateAlert} onCreateIncident={onCreateIncident} skeletonRows={skeletonRows}
    />
  );
}
