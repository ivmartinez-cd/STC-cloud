import { useEffect, useMemo, useState } from 'react';

/**
 * Paginación en memoria para listas que el backend devuelve enteras (sin
 * `limit`/`offset`): monitores de un cliente, operadores, cierres, plantillas…
 * Complemento de `useFitRows` — `pageSize` suele ser `fit.rows`. Si la lista o
 * el tamaño cambian y la página actual queda vacía, vuelve a la última válida.
 */
export function useClientPagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);

  const visible = useMemo(() => items.slice(safePage * size, (safePage + 1) * size), [items, safePage, size]);

  return { page: safePage, setPage, visible, totalPages, total: items.length, pageSize: size };
}
