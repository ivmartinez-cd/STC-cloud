import { usePolledResource } from '../../../shared/hooks/usePolledResource';
import type { AgentActivityEvent, AgentLicense, AgentStats, ConnectivityDay } from '../types/monitorDetail';

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
