import { useState, useCallback, useEffect } from 'react';
import { api } from '../../../shared/lib/api';
import { MergeDeviceModal } from '../../devices/components/DeviceLifecycleModals';

interface DuplicateCandidate {
  a_id: string; a_serial: string | null; a_mac: string | null; a_ip: string | null;
  b_id: string; b_serial: string | null; b_mac: string | null; b_ip: string | null;
  reason: string;
}

const DUPLICATE_REASON_LABEL: Record<string, string> = {
  same_mac: 'misma MAC',
  ghost_same_ip: 'fantasma en la misma IP',
  same_serial_different_monitor: 'mismo serial en dos monitores',
  same_hostname: 'mismo hostname',
};

/** Duplicados candidatos del cliente (§2.4) — sólo admin/operator, herramienta de operaciones. */
export default function DuplicateDevicesCard({ clientId }: { clientId: string }) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergeTarget, setMergeTarget] = useState<{ target: string; clientId: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<DuplicateCandidate[]>(`/devices/duplicates?client_id=${clientId}`)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (!loading && candidates.length === 0) return null;

  return (
    <div className="cd-panel bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-white flex items-center gap-2">
        <h4 className="text-sm font-black tracking-wide">Duplicados a revisar {candidates.length > 0 ? `(${candidates.length})` : ''}</h4>
      </div>
      {loading ? (
        <p className="px-4 py-6 text-xs font-semibold text-slate-400">Buscando duplicados…</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {candidates.map((c) => (
            <div key={`${c.a_id}-${c.b_id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
              <div>
                <p className="font-bold text-slate-700">
                  {c.a_serial ?? c.a_ip ?? c.a_mac ?? '—'} <span className="text-slate-400">↔</span> {c.b_serial ?? c.b_ip ?? c.b_mac ?? '—'}
                </p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{DUPLICATE_REASON_LABEL[c.reason] ?? c.reason}</p>
              </div>
              <button
                onClick={() => setMergeTarget({ target: c.a_id, clientId })}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[11px] font-bold border border-amber-200"
              >
                Revisar
              </button>
            </div>
          ))}
        </div>
      )}
      {mergeTarget && (
        <MergeDeviceModal
          isOpen={true} onClose={() => setMergeTarget(null)} onDone={load}
          deviceId={mergeTarget.target} clientId={mergeTarget.clientId}
        />
      )}
    </div>
  );
}
