import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

/**
 * Cuando el tamaño de página cambia (la ventana se redimensionó y `useFitRows`
 * recalculó), conserva la página actual y sólo la acota si quedó más allá del
 * final. No vuelve a 0: `useFitRows` converge en varios pasos después del montaje
 * (mínimo → estimado → medida real) y un reset pisaría un `?page=` restaurado
 * de la URL. Con `total` desconocido (0, antes de la primera respuesta) no toca nada.
 */
export function usePageSizeReset(pageSize: number, setPage: Dispatch<SetStateAction<number>>, total: number) {
  const prev = useRef(pageSize);
  useEffect(() => {
    if (prev.current === pageSize) return;
    prev.current = pageSize;
    if (total <= 0) return;
    const last = Math.max(0, Math.ceil(total / pageSize) - 1);
    setPage((p) => Math.min(p, last));
  }, [pageSize, total, setPage]);
}
