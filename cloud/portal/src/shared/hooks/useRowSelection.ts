import { useCallback, useState } from 'react';

/**
 * Selección múltiple genérica para tablas con acciones en bloque (Fase 9 del
 * gap analysis vs HP SDS). No se auto-limpia cuando `visibleIds` cambia (p.ej.
 * al paginar o filtrar) — el caller decide cuándo llamar `clear()` (mismo
 * criterio que ya usa `PendingDevices.tsx`).
 */
export function useRowSelection<T extends string | number>(visibleIds: T[]) {
  const [selected, setSelected] = useState<Set<T>>(new Set());

  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(visibleIds);
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return { selected, toggle, toggleAll, clear, allSelected, count: selected.size };
}
