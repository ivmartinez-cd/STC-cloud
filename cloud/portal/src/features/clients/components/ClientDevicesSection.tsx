import { Link } from 'react-router-dom';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import ClientDevicesFilterBar from './ClientDevicesFilterBar';
import ClientDevicesTable from './ClientDevicesTable';
import ClientDevicesPagination from './ClientDevicesPagination';
import { useClientDeviceDirectory, type ClientDeviceDirectoryState } from '../hooks/useClientDeviceDirectory';
import { exportClientDevicesCsv } from '../lib/exportClientDevicesCsv';

/** Rótulo de zona + acciones (exportar / agregar) — fuera de la tarjeta medida
 * por `useFitRows`, así su alto no entra en el cálculo de filas. */
function DevicesToolbar({ clientId, dir }: { clientId: string; dir: ClientDeviceDirectoryState }) {
  return (
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
        <Link to={`/pending?client_id=${clientId}`} className="rounded-[3px] bg-brand px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">
          + Agregar dispositivo
        </Link>
      </div>
    </div>
  );
}

/** Zona "Infraestructura de monitoreo" completa (rótulo + toolbar + tarjeta con
 * filtros/tabla/paginación) de la tab "Dispositivos" de Cliente-detalle. Ocupa
 * todo el alto que le deja la página (`flex-1 min-h-0`): la tabla pide al
 * servidor exactamente las filas que entran (`useFitRows`, 27/08/2026) y la
 * paginación queda al pie de la tarjeta — sin scroll vertical. */
export default function ClientDevicesSection({ clientId, active }: { clientId: string; active: boolean }) {
  const fit = useFitRows({ estimate: 54 });
  const dir = useClientDeviceDirectory(clientId, active, fit.rows);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3.5">
      <DevicesToolbar clientId={clientId} dir={dir} />

      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <ClientDevicesFilterBar
          query={dir.rawQuery} onQueryChange={dir.setRawQuery}
          segment={dir.segment} onSegmentChange={dir.setSegment}
          sortField={dir.sortField} sortDir={dir.sortDir}
        />
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <ClientDevicesTable
            rows={dir.rows} loading={dir.loading} error={dir.error} onRetry={dir.refetch}
            sortField={dir.sortField} sortDir={dir.sortDir} onToggleSort={dir.toggleSort}
            hasActiveFilters={dir.hasActiveFilters} onClearFilters={dir.clearFilters}
            skeletonRows={fit.rows}
          />
        </div>
        {!dir.error && !dir.loading && (
          <ClientDevicesPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} pageSize={dir.pageSize} onPageChange={dir.setPage} />
        )}
      </div>
    </section>
  );
}
