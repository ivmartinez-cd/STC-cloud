import { useMemo } from 'react';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useDeviceDirectory } from '../hooks/useDeviceDirectory';
import DeviceInventoryHeader from '../components/DeviceInventoryHeader';
import DeviceInventoryFilterBar from '../components/DeviceInventoryFilterBar';
import DeviceInventoryBulkBar from '../components/DeviceInventoryBulkBar';
import DeviceDirectoryTable from '../components/DeviceDirectoryTable';
import DeviceInventoryPagination from '../components/DeviceInventoryPagination';

/** Rediseño hifi "Inventario de dispositivos" (handoff 25/08/2026): listado global
 * paginado/filtrado/ordenado server-side, agrupado por cliente (`GET /devices/directory`)
 * + tira de métricas del inventario aparte (`GET /devices/summary`) — mismo patrón que
 * `Clients.tsx`. Área de contenido únicamente — sidebar/topbar son de `app/layout/`. */
const Devices = () => {
  // `reserveRows: 2` descuenta las cabeceras de grupo por cliente que la tabla
  // intercala entre las filas de equipo (no se miden como fila).
  const fit = useFitRows({ estimate: 54, reserveRows: 2 });
  const dir = useDeviceDirectory(fit.rows);
  const visibleIds = useMemo(() => dir.groups.flatMap((g) => g.rows.map((r) => r.id)), [dir.groups]);
  const rowSelection = useRowSelection(visibleIds);
  const hasActiveFilters = dir.effectiveQuery !== '' || dir.segment !== 'todos';
  const handleRefresh = () => { void dir.refetch(); void dir.refetchSummary(); };

  return (
    <div className="-m-4 min-w-0 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10 md:h-full md:min-h-0">
      <DeviceInventoryHeader summary={dir.summary} query={dir.effectiveQuery} segment={dir.segment} sortDir={dir.sortDir} includeDecommissioned={dir.includeDecommissioned} onRefresh={handleRefresh} />
      <div className="mt-4 short:mt-3 flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <DeviceInventoryFilterBar query={dir.rawQuery} onQueryChange={dir.setRawQuery} segment={dir.segment} onSegmentChange={dir.setSegment} includeDecommissioned={dir.includeDecommissioned} onIncludeDecommissionedChange={dir.setIncludeDecommissioned} />
        <DeviceInventoryBulkBar count={rowSelection.count} onClear={rowSelection.clear} />
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <DeviceDirectoryTable
            groups={dir.groups} loading={dir.loading} error={dir.error} onRetry={dir.refetch} skeletonRows={fit.rows}
            sortDir={dir.sortDir} onToggleSort={dir.toggleSort} hasActiveFilters={hasActiveFilters} onClearFilters={dir.clearFilters}
            selected={rowSelection.selected} allSelected={rowSelection.allSelected} onToggleRow={rowSelection.toggle} onToggleAll={rowSelection.toggleAll}
          />
        </div>
        {!dir.error && !dir.loading && (
          <DeviceInventoryPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} pageSize={dir.pageSize} clientsInPage={dir.clientCount} clientsTotal={dir.summary?.clients_total ?? null} onPageChange={dir.setPage} />
        )}
      </div>
    </div>
  );
};

export default Devices;
