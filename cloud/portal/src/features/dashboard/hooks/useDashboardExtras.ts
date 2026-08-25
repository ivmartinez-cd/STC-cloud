import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';

export interface IncidentStats { byStatus: Record<string, number>; openTotal: number }

/** Tri-estado de una carga independiente: `undefined` = todavía cargando,
 * `null` = se intentó y falló, `T` = datos reales. Cada bloque del handoff
 * ("cada tarjeta es una unidad de carga independiente") necesita su propio
 * loading/error/retry — esto evita que la falla de un endpoint tumbe a los
 * otros dos. */
function useSlice<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    setError(false);
    fetcher()
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [fetcher]);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, retry: run };
}

/** Contadores del Dashboard que NO viajan en `/dashboard` (endpoints propios
 * de cada módulo): incidencias, pedidos de consumibles y resumen de
 * consumibles. Se cargan una vez por montaje — no encarecen el polling de
 * `useDashboard`, mismo criterio que tenía `Dashboard.tsx` antes. */
export function useDashboardExtras() {
  const incidents = useSlice(useCallback(() => api.get<IncidentStats>('/incidents/stats'), []));
  const supplyRequests = useSlice(useCallback(() => api.get<Record<string, number>>('/supply-requests/stats'), []));
  const supplies = useSlice(useCallback(() => api.get<SuppliesSummaryResponse>('/supplies/summary'), []));

  return {
    incidents: incidents.data, incidentsLoading: incidents.loading, incidentsError: incidents.error, retryIncidents: incidents.retry,
    supplyRequests: supplyRequests.data, supplyRequestsLoading: supplyRequests.loading, supplyRequestsError: supplyRequests.error, retrySupplyRequests: supplyRequests.retry,
    supplies: supplies.data, suppliesLoading: supplies.loading, suppliesError: supplies.error, retrySupplies: supplies.retry,
  };
}
