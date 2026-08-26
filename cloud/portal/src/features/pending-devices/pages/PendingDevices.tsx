import { useMemo, useState } from 'react';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { BulkMoveDevicesModal } from '../../../shared/components/DeviceLifecycleModals/BulkMoveDevicesModal';
import { usePendingQueue } from '../hooks/usePendingQueue';
import { usePendingQueueActions } from '../hooks/usePendingQueueActions';
import PendingQueueHeader from '../components/PendingQueueHeader';
import PendingQueueMetricsStrip from '../components/PendingQueueMetricsStrip';
import PendingQueueFilterBar from '../components/PendingQueueFilterBar';
import PendingQueueBulkBar from '../components/PendingQueueBulkBar';
import PendingQueueTable from '../components/PendingQueueTable';
import PendingQueuePagination from '../components/PendingQueuePagination';
import PendingQueueDuplicatesBanner from '../components/PendingQueueDuplicatesBanner';
import IgnoreReasonModal from '../components/IgnoreReasonModal';
import DuplicateResolverModal from '../components/DuplicateResolverModal';
import type { PendingQueueRow } from '../types/pendingDevices';

type ModalKind = 'none' | 'ignore' | 'reassign' | 'merge';

/** Decide qué hace ACCIÓN por fila (handoff hifi): `nuevo` aprueba directo,
 * `sin_cliente` abre reasignar, `duplicado` abre el resolver de fusión — sobre
 * un único id, mismo flujo que sus versiones en bloque. */
function useRowAction(approve: (ids: string[]) => void, openModal: (kind: ModalKind, ids: string[]) => void) {
  return (row: PendingQueueRow) => {
    if (row.revision === 'nuevo') approve([row.id]);
    else if (row.revision === 'sin_cliente') openModal('reassign', [row.id]);
    else openModal('merge', [row.id]);
  };
}

/** Rediseño hifi "Dispositivos pendientes" (handoff 25/08/2026): cola CROSS-cliente
 * (`GET /devices/pending/directory`) — arregla el bug de la versión vieja, que exigía
 * elegir un cliente para mostrar cualquier fila. Área de contenido únicamente —
 * sidebar/topbar son de `app/layout/`. */
const PendingDevices = () => {
  const dir = usePendingQueue();
  const visibleIds = useMemo(() => dir.rows.map((r) => r.id), [dir.rows]);
  const rowSelection = useRowSelection(visibleIds);
  const refresh = () => { void dir.refetch(); void dir.refetchSummary(); };
  const actions = usePendingQueueActions(() => { refresh(); rowSelection.clear(); });

  const [modal, setModal] = useState<ModalKind>('none');
  const [actionIds, setActionIds] = useState<string[]>([]);
  const openModal = (kind: ModalKind, ids: string[]) => { setActionIds(ids); setModal(kind); };
  const closeModal = () => setModal('none');

  const approveIds = (ids: string[]) => void actions.approve(ids);
  const onRowAction = useRowAction(approveIds, openModal);
  const hasActiveFilters = dir.effectiveQuery !== '' || dir.clientId !== '' || dir.segment !== 'todos';
  const reassignTarget = actionIds.length === 1 ? dir.rows.find((r) => r.id === actionIds[0]) : undefined;

  return (
    <div className="-m-4 min-w-0 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <PendingQueueHeader
        selectedCount={rowSelection.count} acting={actions.acting}
        onApproveSelected={() => approveIds(Array.from(rowSelection.selected))}
        exportFilters={{ query: dir.effectiveQuery, clientId: dir.clientId, segment: dir.segment }}
      />
      <PendingQueueMetricsStrip summary={dir.summary} loading={dir.summaryLoading} error={dir.summaryError} onRetry={dir.refetchSummary} />
      <div className="rounded-[5px] border border-line-100 bg-white">
        <PendingQueueFilterBar
          query={dir.rawQuery} onQueryChange={dir.setRawQuery}
          clientId={dir.clientId} clients={dir.clients} onClientChange={dir.setClientId}
          segment={dir.segment} onSegmentChange={dir.setSegment} sortDir={dir.sortDir}
        />
        <PendingQueueBulkBar
          count={rowSelection.count} acting={actions.acting}
          onApprove={() => approveIds(Array.from(rowSelection.selected))}
          onReassign={() => openModal('reassign', Array.from(rowSelection.selected))}
          onMerge={() => openModal('merge', Array.from(rowSelection.selected))}
          onIgnore={() => openModal('ignore', Array.from(rowSelection.selected))}
          onClear={rowSelection.clear}
        />
        <PendingQueueTable
          rows={dir.rows} loading={dir.loading} error={dir.error} onRetry={dir.refetch}
          sortDir={dir.sortDir} onToggleSort={dir.toggleSort} hasActiveFilters={hasActiveFilters} onClearFilters={dir.clearFilters}
          selected={rowSelection.selected} allSelected={rowSelection.allSelected} onToggleRow={rowSelection.toggle} onToggleAll={rowSelection.toggleAll}
          onRowAction={onRowAction}
        />
        {!dir.error && !dir.loading && (
          <PendingQueuePagination page={dir.page} totalPages={dir.totalPages} total={dir.total} waiting7dPlus={dir.summary?.waiting_7d_plus ?? 0} onPageChange={dir.setPage} />
        )}
      </div>
      <PendingQueueDuplicatesBanner
        count={dir.summary?.possible_duplicates ?? 0}
        onMergeClick={() => openModal('merge', dir.rows.filter((r) => r.revision === 'duplicado').map((r) => r.id))}
      />

      <IgnoreReasonModal
        isOpen={modal === 'ignore'} count={actionIds.length} acting={actions.acting}
        onClose={closeModal}
        onConfirm={async (reason) => { if (await actions.ignore(actionIds, reason)) closeModal(); }}
      />
      <BulkMoveDevicesModal
        isOpen={modal === 'reassign'} onClose={closeModal}
        onDone={() => { closeModal(); refresh(); rowSelection.clear(); }}
        deviceIds={actionIds} currentClientId={reassignTarget?.client_id ?? null} currentAgentId={reassignTarget?.agent_id ?? null}
      />
      <DuplicateResolverModal
        isOpen={modal === 'merge'} onClose={closeModal}
        onDone={() => { refresh(); rowSelection.clear(); }}
        deviceIds={actionIds} rows={dir.rows}
      />
    </div>
  );
};

export default PendingDevices;
