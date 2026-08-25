import { Bell, Check, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import BulkActionBar from '../../../shared/components/BulkActionBar';
import CreateIncidentModal from '../../../shared/components/CreateIncidentModal';
import { useAlertsPage, type AlertsPageState } from '../hooks/useAlertsPage';
import AlertFilters from '../components/AlertFilters';
import AlertsTable from '../components/AlertsTable';
import AlertsPagination from '../components/AlertsPagination';

const Header = ({ summary }: { summary: AlertsPageState['summary'] }) => (
  <header className="flex items-center justify-between">
    <div>
      <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight flex items-center gap-3">
        <Bell size={28} className="text-brand" /> Alertas
      </h1>
      <p className="text-slate-500 text-sm font-medium mt-1">Tóner, resets de contador, monitores y equipos sin señal.</p>
    </div>
    {summary && (
      <div className="text-right">
        <p className="text-2xl font-extrabold text-[#1a2333]">{summary.total}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {summary.bySeverity.critical} críticas · {summary.bySeverity.warning} advertencias
        </p>
      </div>
    )}
  </header>
);

const Loading = () => (
  <div className="h-64 flex flex-col items-center justify-center animate-pulse">
    <Loader2 size={32} className="text-brand animate-spin mb-3" />
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando alertas...</p>
  </div>
);

const Empty = () => (
  <div className="h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-3xl border border-emerald-100 border-dashed">
    <ShieldCheck size={48} className="mb-3 text-emerald-500" />
    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600">Sin alertas</h4>
    <p className="text-[10px] font-bold text-slate-400 mt-1">Ningún resultado con los filtros actuales</p>
  </div>
);

const BULK_BTN = 'flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50';

/** Selección múltiple sólo sobre la página visible: nunca se reconoce/resuelve lo que no se vio. */
const BulkActions = ({ s }: { s: AlertsPageState }) => (
  <BulkActionBar count={s.rowSelection.count} onClear={s.rowSelection.clear}>
    <button disabled={s.bulkBusy} onClick={() => s.bulkUpdate({ acknowledged: true })} className={`${BULK_BTN} bg-brand hover:bg-brand-hover`}>
      <Check size={13} /> Reconocer
    </button>
    <button disabled={s.bulkBusy} onClick={() => s.bulkUpdate({ resolved: true })} className={`${BULK_BTN} bg-emerald-500 hover:bg-emerald-600`}>
      <CheckCircle2 size={13} /> Resolver
    </button>
  </BulkActionBar>
);

const Results = ({ s }: { s: AlertsPageState }) => {
  if (s.loading) return <Loading />;
  if (s.alerts.length === 0) return <Empty />;
  return (
    <>
      {!s.isReadOnlyViewer && <BulkActions s={s} />}
      <AlertsTable
        alerts={s.alerts} classOptions={s.classOptions} responderOptions={s.responderOptions}
        readOnly={s.isReadOnlyViewer} selection={s.rowSelection} pendingId={s.pendingId}
        onUpdate={s.updateAlert} onCreateIncident={s.setIncidentModalAlert}
      />
    </>
  );
};

const Alerts = () => {
  const s = useAlertsPage();
  const modalAlert = s.incidentModalAlert;
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Header summary={s.summary} />
      <AlertFilters filters={s.filters} classOptions={s.classOptions} clients={s.clients} canFilterByClient={s.canFilterByClient} />
      {s.error && <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium">{s.error}</div>}
      <Results s={s} />
      <AlertsPagination page={s.page} pageCount={s.alerts.length} onChange={s.setPage} />
      <CreateIncidentModal
        isOpen={!!modalAlert}
        onClose={() => s.setIncidentModalAlert(null)}
        onCreated={() => { void s.fetchAlerts(); }}
        clients={s.clients}
        initialClientId={modalAlert?.client_id ?? undefined}
        initialDeviceId={modalAlert?.device_id ?? undefined}
        initialClass={modalAlert?.alert_class ?? undefined}
        initialAlertIds={modalAlert ? [modalAlert.id] : undefined}
      />
    </div>
  );
};

export default Alerts;
