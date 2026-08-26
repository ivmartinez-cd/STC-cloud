import { useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';

export interface LoginStats {
  clients: number;
  devices: number;
  agents: number;
  monthlyVolume: number;
}

/** Tira de métricas del panel de marca en /login (handoff hifi "Login", 26/08/2026) —
 * `GET /portal/login-stats` es público (sin sesión) y cacheado 60s en el backend. */
export function useLoginStats() {
  const [stats, setStats] = useState<LoginStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<LoginStats>('/portal/login-stats')
      .then((res) => { if (!cancelled) setStats(res); })
      .catch(() => { /* la tira de marca es decorativa — sin stats sigue andando el login */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { stats, loading };
}
