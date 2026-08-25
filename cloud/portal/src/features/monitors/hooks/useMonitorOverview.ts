import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import type { AgentActivityEvent, AgentLicense, AgentStats, ConnectivityDay } from '../types/monitorDetail';

const POLL_MS = 60_000; // README: "resto cada 60 s" (aparte del poll de 30/45s de `ultimoContactoAt`/estado)

/** Hook genérico "cargar, sondear, reintentar" para un bloque de la pantalla que
 * carga y falla de forma INDEPENDIENTE del resto (README: "Cada tarjeta carga y
 * falla de forma independiente"). `enabled=false` evita pedir endpoints fuera del
 * allowlist de un rol (ej. `client_viewer` contra `/activity`). */
function usePolledResource<T>(path: string, enabled: boolean, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    api.get<T>(path)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [path, enabled]);

  useEffect(() => {
    load();
    if (!enabled) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, enabled]);

  return { data, loading, error, refetch: load };
}

export function useMonitorStats(agentId: string) {
  const { data, loading, error, refetch } = usePolledResource<AgentStats | null>(`/agents/${agentId}/stats`, true, null);
  return { stats: data, loading, error, refetch };
}

export function useMonitorConnectivity(agentId: string) {
  const { data, loading, error, refetch } = usePolledResource<ConnectivityDay[]>(`/agents/${agentId}/connectivity`, true, []);
  return { days: data, loading, error, refetch };
}

export function useMonitorLicense(agentId: string) {
  const { data, loading, error, refetch } = usePolledResource<AgentLicense | null>(`/agents/${agentId}/license`, true, null);
  return { license: data, loading, error, refetch };
}

/** "Actividad reciente" — deliberadamente afuera del allowlist de `client_viewer`
 * (`rolePolicy.ts`: expone quién hizo qué) — `enabled` debe venir en `false` para
 * ese rol, para no disparar un 403 contra la pantalla. */
export function useMonitorActivity(agentId: string, enabled: boolean) {
  const { data, loading, error, refetch } = usePolledResource<AgentActivityEvent[]>(`/agents/${agentId}/activity?limit=15`, enabled, []);
  return { events: data, loading, error, refetch };
}
