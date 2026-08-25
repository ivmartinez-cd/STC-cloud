import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import type { DuplicateCandidate } from '../types/clientDetail';

/** Fuente única de "duplicados sin resolver" — la usan tanto la métrica de la tira
 * (recuento) como `DuplicateDevicesCard.tsx` (el detalle), para que nunca se
 * desincronicen (handoff hifi "Cliente — detalle", 25/08/2026). Sólo admin/operator:
 * `GET /devices/duplicates` no está en el allowlist de `client_viewer` (rbac.test.ts). */
export function useDuplicateDevices(clientId: string, enabled: boolean) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    api.get<DuplicateCandidate[]>(`/devices/duplicates?client_id=${clientId}`)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [clientId, enabled]);

  useEffect(() => { load(); }, [load]);

  return { candidates, loading, refetch: load };
}
