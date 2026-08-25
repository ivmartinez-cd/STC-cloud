import { Link } from 'react-router-dom';
import ZoneLabel from './ZoneLabel';
import ClientDevicesFilterBar from './ClientDevicesFilterBar';
import ClientDevicesTable from './ClientDevicesTable';
import ClientDevicesPagination from './ClientDevicesPagination';
import { useClientDeviceDirectory } from '../hooks/useClientDeviceDirectory';
import { exportClientDevicesCsv } from '../lib/exportClientDevicesCsv';

/** Zona "Infraestructura de monitoreo" completa (rótulo + toolbar + tarjeta con
 * filtros/tabla/paginación) — reusada tal cual tanto al pie de "Resumen" como en
 * la tab "Dispositivos" a pantalla completa (README: "las demás pestañas reusan la
 * tabla... a pantalla completa"). */
export default function ClientDevicesSection({ clientId, active }: { clientId: string; active: boolean }) {
  const dir = useClientDeviceDirectory(clientId, active);

  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <ZoneLabel text={`Infraestructura de monitoreo · ${dir.total} dispositivos`} lineColorClass="bg-brand" />
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => exportClientDevicesCsv(clientId, dir.effectiveQuery, dir.segment, dir.sortField, dir.sortDir)}
            className="rounded-[3px] border border-line-300 bg-white px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover"
          >
            Exportar
          </button>
          <Link
            to={`/pending?client_id=${clientId}`}
            className="rounded-[3px] bg-brand px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe"
          >
            + Agregar dispositivo
          </Link>
        </div>
      </div>

      <div className="rounded-[5px] border border-line-100 bg-white">
        <ClientDevicesFilterBar
          query={dir.rawQuery} onQueryChange={dir.setRawQuery}
          segment={dir.segment} onSegmentChange={dir.setSegment}
          sortField={dir.sortField} sortDir={dir.sortDir}
        />
        <ClientDevicesTable
          rows={dir.rows} loading={dir.loading} error={dir.error} onRetry={dir.refetch}
          sortField={dir.sortField} sortDir={dir.sortDir} onToggleSort={dir.toggleSort}
          hasActiveFilters={dir.hasActiveFilters} onClearFilters={dir.clearFilters}
        />
        {!dir.error && !dir.loading && (
          <ClientDevicesPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} onPageChange={dir.setPage} />
        )}
      </div>
    </section>
  );
}
