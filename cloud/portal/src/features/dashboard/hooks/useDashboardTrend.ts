import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import type { AlertHotspots, DashboardTrend, HotspotKind, TrendRange } from '../../../shared/types/monitor';

/**
 * Las dos cargas del panel que dependen de un control de la pantalla: la
 * tendencia (chip de rango) y la concentración de alertas (pestaña
 * Dispositivos/Cuentas).
 *
 * Van por `useLatestRequest` — patrón obligatorio del portal desde la auditoría
 * del 12/09/2026: al tocar el chip dos veces seguidas, la respuesta de la
 * primera no puede pisar a la de la segunda.
 *
 * Se conserva lo último bueno mientras recarga: cambiar de rango no debe vaciar
 * el titular. Un fallo deja `null`, que es lo mismo que "todavía no hay
 * historia" — el panel omite la tendencia en vez de dibujar una línea inventada.
 */
function useScopedFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const beginRequest = useLatestRequest();

  const load = useCallback(() => {
    const isLatest = beginRequest();
    setLoading(true);
    setError(false);
    api.get<T>(path)
      .then((res) => { if (isLatest()) { setData(res); setLoading(false); } })
      .catch(() => { if (isLatest()) { setData(null); setError(true); setLoading(false); } });
  }, [path, beginRequest]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, retry: load };
}

export function useDashboardTrend(range: TrendRange) {
  const { data, loading, retry } = useScopedFetch<DashboardTrend>(`/dashboard/trend?range=${range}`);
  return { trend: data, trendLoading: loading, retryTrend: retry };
}

export function useAlertHotspots(by: HotspotKind) {
  const { data, loading, error, retry } = useScopedFetch<AlertHotspots>(`/dashboard/hotspots?by=${by}`);
  return { hotspots: data, hotspotsLoading: loading, hotspotsError: error, retryHotspots: retry };
}
