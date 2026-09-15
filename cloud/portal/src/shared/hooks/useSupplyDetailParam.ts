import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SupplyDetailTarget } from '../components/SupplyDetailModal';

const PARAM = 'supply';
const SEP = '~';

/**
 * Modal "Detalles del consumible" en la URL (`?supply=<deviceId>~<key>`) —
 * mismo criterio que `?request=<id>` de Pedidos: el modal se puede compartir
 * por link y sobrevive a un refresh. `~` como separador porque los uuid no
 * lo usan y las claves de consumible tampoco (`toner-black`, `mt-fuser`…).
 */
export function useSupplyDetailParam(): [SupplyDetailTarget | null, (t: SupplyDetailTarget | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);

  const target = useMemo(() => {
    if (!raw) return null;
    const at = raw.indexOf(SEP);
    if (at <= 0 || at === raw.length - 1) return null;
    return { deviceId: raw.slice(0, at), supplyKey: raw.slice(at + 1) };
  }, [raw]);

  const setTarget = useCallback((t: SupplyDetailTarget | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t) next.set(PARAM, `${t.deviceId}${SEP}${t.supplyKey}`);
      else next.delete(PARAM);
      return next;
    }, { replace: true });
  }, [setParams]);

  return [target, setTarget];
}
