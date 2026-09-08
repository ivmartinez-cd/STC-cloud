import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader';
import CreateIncidentModal from '../../../shared/components/CreateIncidentModal';
import { BTN_PRIMARY_LG, BTN_SECONDARY_LG } from '../../../shared/lib/buttons';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useIncidentsPage, type IncidentsPageState } from '../hooks/useIncidentsPage';
import { exportIncidentsCsv } from '../lib/exportIncidentsCsv';
import IncidentsByClassPanel from '../components/IncidentsByClassPanel';
import IncidentsInstantClosuresBanner from '../components/IncidentsInstantClosuresBanner';
import IncidentsFilterBar from '../components/IncidentsFilterBar';
import IncidentsTable from '../components/IncidentsTable';
import IncidentsPagination from '../components/IncidentsPagination';

function HeaderActions({ s, exporting, onExport, onCreate }: { s: IncidentsPageState; exporting: boolean; onExport: () => void; onCreate: () => void }) {
  return (
    <>
      <button type="button" onClick={onExport} disabled={exporting} className={BTN_SECONDARY_LG}>{exporting ? 'EXPORTANDO…' : 'EXPORTAR'}</button>
      {s.canManage && <button type="button" onClick={onCreate} className={BTN_PRIMARY_LG}>+ NUEVO INCIDENTE</button>}
    </>
  );
}

function hasActiveFilters(f: IncidentsPageState['filters']): boolean {
  return !!f.q || f.openOnly || f.old24h || f.noDevice;
}

function clearFilters(f: IncidentsPageState['filters']): void {
  f.setQ(''); f.setOpenOnly(false); f.setOld24h(false); f.setNoDevice(false);
}

function Incidents() {
  const fit = useFitRows({ estimate: 54 });
  const s = useIncidentsPage(fit.rows);
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try { await exportIncidentsCsv(s.filters); } finally { setExporting(false); }
  };

  return (
    <div className="-m-4 flex min-w-0 flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <PageHeader
        eyebrow="UNIDADES DE TRABAJO DE SERVICIO" title="Incidentes"
        subtitle="Sobreviven a que la alerta técnica que los originó se resuelva sola: el incidente sigue abierto hasta que un operador lo cierra."
        actions={<HeaderActions s={s} exporting={exporting} onExport={handleExport} onCreate={() => setShowCreate(true)} />}
      />

      <div className="mb-4 short:mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IncidentsByClassPanel
          byClass={s.stats?.byClass ?? []} classLabels={s.classLabels} openTotal={s.stats?.openTotal ?? 0}
          avgAgingSeconds={s.stats?.avgAgingSeconds ?? 0} maxAgingSeconds={s.stats?.maxAgingSeconds ?? 0}
          loading={s.statsLoading} error={s.statsError} onRetry={s.fetchStats}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <IncidentsFilterBar filters={s.filters} />
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <IncidentsTable
            items={s.items} classLabels={s.classLabels} loading={s.loading} error={s.error}
            hasActiveFilters={hasActiveFilters(s.filters)} onRetry={s.fetchIncidents} onClearFilters={() => clearFilters(s.filters)}
            skeletonRows={fit.rows}
          />
        </div>
        <IncidentsPagination page={s.page} total={s.total} totalPages={s.totalPages} pageSize={s.pageSize} onChange={s.setPage} />
      </div>

      {/* Banner de cierres instantáneos: fuera de la tarjeta que crece, se queda al pie. */}
      {s.stats && (
        <div className="mt-4 shrink-0">
          <IncidentsInstantClosuresBanner instantClosures={s.stats.instantClosures} classLabels={s.classLabels} />
        </div>
      )}

      <CreateIncidentModal
        isOpen={showCreate} onClose={() => setShowCreate(false)}
        onCreated={(id) => navigate(`/incidents/${id}`)} clients={s.clients}
      />
    </div>
  );
}

export default Incidents;
