import { useEffect, useState } from 'react';
import { ConfirmationModal } from '../ConfirmationModal';
import { api } from '../../lib/api';
import type { BulkActionResult } from './types';

interface BulkDecommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (result: BulkActionResult) => void;
  deviceIds: string[];
}

export function BulkDecommissionModal({ isOpen, onClose, onDone, deviceIds }: BulkDecommissionModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setReason(''); setError(null); } }, [isOpen]);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.post<BulkActionResult>('/devices/bulk/decommission', { ids: deviceIds, reason });
      onDone(result); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmationModal
      isOpen={isOpen} onClose={onClose} onConfirm={confirm} title={`Dar de baja ${deviceIds.length} equipo(s)`}
      variant="warning" confirmLabel="Dar de baja" loading={loading} error={error}
      confirmDisabled={!reason.trim()}
      extra={
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Motivo de la baja (obligatorio)"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mt-2"
        />
      }
    >
      Los equipos seleccionados dejan de contarse en inventario, dashboard y alertas.
      Su historial se conserva intacto y se pueden reactivar en cualquier momento.
    </ConfirmationModal>
  );
}
