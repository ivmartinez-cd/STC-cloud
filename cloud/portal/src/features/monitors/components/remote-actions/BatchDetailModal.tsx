import { useState } from 'react';
import { BrandModal } from '../../../../shared/components/BrandModal';
import { api } from '../../../../shared/lib/api';
import { useToast } from '../../../../store/ToastContext';
import { formatShortDateTime } from '../../../../shared/lib/formatters';
import { ACTION_LABELS, STATUS_LABELS, type RemoteActionBatchDetail, type RemoteActionBatchItem } from '../../types/remoteActions';
import StatusChip, { itemStatusChip } from './StatusChip';

/** POST de cancelación — separado del render (guía §4: ninguna función
 * arriba de 20 líneas). El botón "Cancelar lote" reemplaza al que antes
 * vivía en una columna aparte de la tabla: el nuevo grid de 8 columnas del
 * handoff no tiene lugar para él. */
function useCancelBatch(detail: RemoteActionBatchDetail | null, onClose: () => void, onCancelled: () => void) {
  const { showToast } = useToast();
  const [cancelling, setCancelling] = useState(false);

  const cancel = async () => {
    if (!detail) return;
    setCancelling(true);
    try {
      await api.post(`/remote-actions/${detail.id}/cancel`);
      showToast(`Lote #${detail.number} cancelado`, 'success');
      onClose(); onCancelled();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo cancelar', 'error');
    } finally { setCancelling(false); }
  };

  return { cancelling, cancel };
}

function DetailHeader({ detail, cancelling, onCancel }: { detail: RemoteActionBatchDetail; cancelling: boolean; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="font-sans text-xs text-ink-400">
        {ACTION_LABELS[detail.action] ?? detail.action} · {STATUS_LABELS[detail.status] ?? detail.status} · programado {formatShortDateTime(detail.scheduled_at)}
      </p>
      {detail.status === 'scheduled' && (
        <button
          type="button" onClick={onCancel} disabled={cancelling}
          className="shrink-0 rounded-[3px] border border-line-300 bg-white px-3 py-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-soft disabled:opacity-50"
        >
          {cancelling ? 'Cancelando…' : 'Cancelar lote'}
        </button>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: RemoteActionBatchItem }) {
  const chip = itemStatusChip(item.command_status);
  return (
    <div className="flex items-center justify-between border-b border-line-150 py-2 font-sans text-xs font-semibold text-ink-700">
      {item.device_label ?? item.device_ip ?? item.agent_name ?? item.agent_id}
      <StatusChip label={chip.label} tone={chip.tone} />
    </div>
  );
}

/** Detalle de un lote al hacer click en la fila — restyle institucional del
 * modal existente (chips por ítem ya no son colores sueltos). */
export default function BatchDetailModal({ detail, onClose, onCancelled }: {
  detail: RemoteActionBatchDetail | null; onClose: () => void; onCancelled: () => void;
}) {
  const { cancelling, cancel } = useCancelBatch(detail, onClose, onCancelled);
  return (
    <BrandModal isOpen={!!detail} onClose={onClose} title={detail ? `Lote #${detail.number}` : ''} widthPx={520}>
      {detail && (
        <div className="space-y-2">
          <DetailHeader detail={detail} cancelling={cancelling} onCancel={cancel} />
          {detail.items.map((i) => <ItemRow key={i.device_id ?? i.agent_id} item={i} />)}
        </div>
      )}
    </BrandModal>
  );
}
