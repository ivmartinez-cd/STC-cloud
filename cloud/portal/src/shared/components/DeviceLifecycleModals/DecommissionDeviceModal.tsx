import { useEffect, useState } from 'react';
import { ConfirmationModal } from '../ConfirmationModal';
import { api } from '../../lib/api';

interface DecommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  deviceId: string;
}

export function DecommissionDeviceModal({ isOpen, onClose, onDone, deviceId }: DecommissionModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setReason(''); setError(null); } }, [isOpen]);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      await api.post(`/devices/${deviceId}/decommission`, { reason });
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmationModal
      isOpen={isOpen} onClose={onClose} onConfirm={confirm} title="Dar de baja este equipo"
      variant="warning" confirmLabel="Dar de baja" loading={loading} error={error}
      confirmDisabled={!reason.trim()}
      extra={
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Motivo de la baja (obligatorio)"
          className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
        />
      }
    >
      El equipo deja de contarse en inventario, dashboard y alertas. Su historial de lecturas
      y sus cierres de facturación se conservan intactos, y se puede reactivar en cualquier momento.
    </ConfirmationModal>
  );
}
