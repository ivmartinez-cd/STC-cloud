import { useEffect, useRef } from 'react';

/**
 * Cuando el tamaño de página cambia DESPUÉS del montaje (la ventana se
 * redimensionó y `useFitRows` recalculó), la página actual deja de tener
 * sentido — se vuelve a la primera. En el primer render no hace nada, para
 * respetar un `?page=` que venga en la URL.
 */
export function usePageSizeReset(pageSize: number, setPage: (p: number) => void) {
  const prev = useRef(pageSize);
  useEffect(() => {
    if (prev.current !== pageSize) {
      prev.current = pageSize;
      setPage(0);
    }
  }, [pageSize, setPage]);
}
