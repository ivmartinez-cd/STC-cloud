import { useCallback, useRef } from 'react';

/**
 * Descarta respuestas de requests que ya no son el último: dos clics rápidos en
 * chips distintos (o chip + página siguiente) con backend lento hacían que la
 * respuesta más lenta llegara última y pisara la tabla con filas de un filtro
 * que ya no estaba activo (auditoría 12/09/2026).
 *
 *   const isLatest = beginRequest();
 *   const data = await api.get(...);
 *   if (!isLatest()) return;
 */
export function useLatestRequest(): () => () => boolean {
  const seq = useRef(0);
  return useCallback(() => {
    const mine = ++seq.current;
    return () => mine === seq.current;
  }, []);
}
