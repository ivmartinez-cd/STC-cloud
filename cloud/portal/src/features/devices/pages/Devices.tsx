import { useMemo } from 'react';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { useDeviceDirectory } from '../hooks/useDeviceDirectory';
import DeviceInventoryHeader from '../components/DeviceInventoryHeader';
import DeviceInventoryMetricsStrip from '../components/DeviceInventoryMetricsStrip';
import DeviceInventoryFilterBar from '../components/DeviceInventoryFilterBar';
import DeviceInventoryBulkBar from '../components/DeviceInventoryBulkBar';
import DeviceDirectoryTable from '../components/DeviceDirectoryTable';
import DeviceInventoryPagination from '../components/DeviceInventoryPagination';

/** Rediseño hifi "Inventario de dispositivos" (handoff 25/08/2026): listado global
 * paginado/filtrado/ordenado server-side, agrupado por cliente (`GET /devices/directory`)
 * + tira de métricas del inventario aparte (`GET /devices/summary`) — mismo patrón que
 * `Clients.tsx`. Área de contenido únicamente — sidebar/topbar son de `app/layout/`. */
const Devices = () => {
  const dir = useDeviceDirectory();
  const visibleIds = useMemo(() => dir.groups.flatMap((g) => g.rows.map((r) => r.id)), [dir.groups]);
  const rowSelection = useRowSelection(visibleIds);
  const hasActiveFilters = dir.effectiveQuery !== '' || dir.segment !== 'todos';
  const handleRefresh = () => { void dir.refetch(); void dir.refetchSummary(); };

  return (
    <div className="-m-4 min-w-0 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <DeviceInventoryHeader summary={dir.summary} query={dir.effectiveQuery} segment={dir.segment} sortDir={dir.sortDir} includeDecommissioned={dir.includeDecommissioned} onRefresh={handleRefresh} />
      <DeviceInventoryMetricsStrip summary={dir.summary} loading={dir.summaryLoading} error={dir.summaryError} onRetry={dir.refetchSummary} />
      <div className="rounded-[5px] border border-line-100 bg-white">
        <DeviceInventoryFilterBar query={dir.rawQuery} onQueryChange={dir.setRawQuery} segment={dir.segment} onSegmentChange={dir.setSegment} includeDecommissioned={dir.includeDecommissioned} onIncludeDecommissionedChange={dir.setIncludeDecommissioned} />
        <DeviceInventoryBulkBar count={rowSelection.count} onClear={rowSelection.clear} />
        <DeviceDirectoryTable
          groups={dir.groups} loading={dir.loading} error={dir.error} onRetry={dir.refetch}
          sortDir={dir.sortDir} onToggleSort={dir.toggleSort} hasActiveFilters={hasActiveFilters} onClearFilters={dir.clearFilters}
          selected={rowSelection.selected} allSelected={rowSelection.allSelected} onToggleRow={rowSelection.toggle} onToggleAll={rowSelection.toggleAll}
        />
        {!dir.error && !dir.loading && (
          <DeviceInventoryPagination page={dir.page} totalPages={dir.totalPages} total={dir.total} clientsInPage={dir.clientCount} clientsTotal={dir.summary?.clients_total ?? null} onPageChange={dir.setPage} />
        )}
      </div>
    </div>
  );
};

export default Devices;
