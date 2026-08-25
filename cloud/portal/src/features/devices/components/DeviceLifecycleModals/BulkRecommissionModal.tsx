import { useState } from 'react';
import { ConfirmationModal } from '../../../../shared/components/ConfirmationModal';
import { api } from '../../../../shared/lib/api';
import type { BulkActionResult } from './types';

interface BulkRecommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (result: BulkActionResult) => void;
  deviceIds: string[];
}

export function BulkRecommissionModal({ isOpen, onClose, onDone, deviceIds }: BulkRecommissionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.post<BulkActionResult>('/devices/bulk/recommission', { ids: deviceIds });
      onDone(result); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmationModal
      isOpen={isOpen} onClose={onClose} onConfirm={confirm} title={`Reactivar ${deviceIds.length} equipo(s)`}
      variant="simple" confirmLabel="Reactivar" loading={loading} error={error}
    >
      Los equipos vuelven a contarse en inventario, dashboard, alertas y facturación.
    </ConfirmationModal>
  );
}
