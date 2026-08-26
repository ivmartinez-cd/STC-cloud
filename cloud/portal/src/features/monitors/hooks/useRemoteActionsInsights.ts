import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import type { RemoteActionByTypeResponse, RemoteActionSummary } from '../types/remoteActions';

/** Tira de métricas de 7 días + resultado por tipo de acción (handoff hifi
 * "Acciones remotas") — endpoints aparte de la tabla, loading/error
 * independientes, mismo criterio que `useDirectorySummary` en `clients`. */
function useSummary() {
  const [summary, setSummary] = useState<RemoteActionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSummary(await api.get<RemoteActionSummary>('/remote-actions/summary'));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSummary(); }, [fetchSummary]);
  return { summary, summaryLoading: loading, summaryError: error, refetchSummary: fetchSummary };
}

function useByType() {
  const [byType, setByType] = useState<RemoteActionByTypeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchByType = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setByType(await api.get<RemoteActionByTypeResponse>('/remote-actions/by-type'));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchByType(); }, [fetchByType]);
  return { byType, byTypeLoading: loading, byTypeError: error, refetchByType: fetchByType };
}

export function useRemoteActionsInsights() {
  return { ...useSummary(), ...useByType() };
}

export type RemoteActionsInsightsState = ReturnType<typeof useRemoteActionsInsights>;
