import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pageParam } from '../lib/urlParams';

/** Página en la URL (`?<urlKey>=`, 1-based) en vez de en memoria: sobrevive a F5
 * y a volver desde un detalle. El clamp NO se persiste, igual que `clampPage`:
 * `pageSize` viene de `useFitRows` y es transitorio al montar. */
function useUrlPage(urlKey: string | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = urlKey ? pageParam.parse(searchParams.get(urlKey)) : 0;
  const setUrlPage = useCallback((next: number) => {
    if (!urlKey) return;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      const formatted = pageParam.format(next);
      if (formatted === null) params.delete(urlKey); else params.set(urlKey, formatted);
      return params;
    }, { replace: true });
  }, [urlKey, setSearchParams]);
  return { urlPage, setUrlPage };
}

/**
 * Paginación en memoria para listas que el backend devuelve enteras (sin
 * `limit`/`offset`): monitores de un cliente, operadores, cierres, plantillas…
 * Complemento de `useFitRows` — `pageSize` suele ser `fit.rows`. Si la lista o
 * el tamaño cambian y la página actual queda vacía, vuelve a la última válida.
 *
 * Con `urlKey` la página vive en la URL (auditoría 12/09/2026: las listas largas
 * volvían a la página 1 al refrescar o al volver de un detalle); sin él, el
 * comportamiento es el de siempre, en memoria.
 */
export function useClientPagination<T>(items: T[], pageSize: number, urlKey?: string) {
  const [localPage, setLocalPage] = useState(0);
  const { urlPage, setUrlPage } = useUrlPage(urlKey);
  const page = urlKey ? urlPage : localPage;
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(page, totalPages - 1);

  // Sólo en memoria: con la página en la URL se acota al mostrar, sin reescribirla.
  useEffect(() => { if (!urlKey && page !== safePage) setLocalPage(safePage); }, [urlKey, page, safePage]);

  const setPage = useCallback((next: number) => {
    if (urlKey) setUrlPage(next); else setLocalPage(next);
  }, [urlKey, setUrlPage]);

  const visible = useMemo(() => items.slice(safePage * size, (safePage + 1) * size), [items, safePage, size]);

  return { page: safePage, setPage, visible, totalPages, total: items.length, pageSize: size };
}
