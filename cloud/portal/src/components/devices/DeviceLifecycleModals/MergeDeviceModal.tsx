import { useEffect, useState } from 'react';
import { ConfirmationModal } from '../../ui/ConfirmationModal';
import { api } from '../../../lib/api';

interface DuplicateCandidate {
  a_id: string; a_serial: string | null; a_mac: string | null; a_ip: string | null;
  b_id: string; b_serial: string | null; b_mac: string | null; b_ip: string | null;
  reason: string;
}

interface MergeDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  deviceId: string;
  clientId: string | null;
}

export function MergeDeviceModal({ isOpen, onClose, onDone, deviceId, clientId }: MergeDeviceModalProps) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!isOpen || !clientId) return;
    setSourceId(''); setError(null); setTyped('');
    api.get<DuplicateCandidate[]>(`/devices/duplicates?client_id=${clientId}`)
      .then((rows) => setCandidates(rows.filter((r) => r.a_id === deviceId || r.b_id === deviceId)))
      .catch(() => setCandidates([]));
  }, [isOpen, clientId, deviceId]);

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      await api.post(`/devices/${deviceId}/merge`, { sourceDeviceId: sourceId });
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const otherIdOf = (c: DuplicateCandidate) => (c.a_id === deviceId ? c.b_id : c.a_id);
  const labelOf = (c: DuplicateCandidate) => {
    const other = c.a_id === deviceId ? { serial: c.b_serial, mac: c.b_mac, ip: c.b_ip } : { serial: c.a_serial, mac: c.a_mac, ip: c.a_ip };
    return `${other.serial ?? other.ip ?? other.mac ?? '—'} (${c.reason})`;
  };

  return (
    <ConfirmationModal
      isOpen={isOpen} onClose={onClose} onConfirm={confirm} title="Fusionar con un duplicado"
      variant="destructive" confirmLabel="Fusionar" confirmText="FUSIONAR" loading={loading} error={error}
      confirmDisabled={!sourceId || typed !== 'FUSIONAR'}
      extra={
        <div className="space-y-3 mt-2">
          {candidates.length === 0 ? (
            <p className="text-[11px] text-slate-500">No se detectaron duplicados candidatos para este equipo.</p>
          ) : (
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Elegí el equipo a fusionar…</option>
              {candidates.map((c) => (
                <option key={otherIdOf(c)} value={otherIdOf(c)}>{labelOf(c)}</option>
              ))}
            </select>
          )}
          <input
            value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Escribí FUSIONAR para confirmar"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      }
    >
      Este equipo quedará como registro fusionado (lápida): sus lecturas y alertas se mueven al superviviente,
      y sus cierres de facturación ya emitidos no se alteran. La acción no se puede deshacer desde el portal.
    </ConfirmationModal>
  );
}
