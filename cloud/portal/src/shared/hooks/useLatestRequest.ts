import { useCallback, useEffect, useRef } from 'react';

/**
 * Descarta respuestas de requests que ya no son el último: dos clics rápidos en
 * chips distintos (o chip + página siguiente) con backend lento hacían que la
 * respuesta más lenta llegara última y pisara la tabla con filas de un filtro
 * que ya no estaba activo (auditoría 12/09/2026). En las pantallas de detalle
 * el caso típico es el refetch manual (ACTUALIZAR) cruzado con el poll.
 *
 *   const isLatest = beginRequest();
 *   const data = await api.get(...);
 *   if (!isLatest()) return;
 *
 * Tras desmontar, `isLatest()` siempre da `false`: una respuesta en vuelo no
 * llama setState sobre un componente que ya no está (y un `.finally` no vuelve
 * a programar un poll huérfano). `alive` se re-activa en el montaje porque
 * StrictMode monta, desmonta y vuelve a montar en desarrollo.
 */
export function useLatestRequest(): () => () => boolean {
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  return useCallback(() => {
    const mine = ++seq.current;
    return () => alive.current && mine === seq.current;
  }, []);
}
