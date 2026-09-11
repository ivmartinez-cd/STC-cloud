import { useEffect, useRef, type DependencyList, type EffectCallback } from 'react';

/** Como `useEffect`, pero no corre en el montaje: sólo cuando cambian las deps. */
export function useUpdateEffect(effect: EffectCallback, deps: DependencyList) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
