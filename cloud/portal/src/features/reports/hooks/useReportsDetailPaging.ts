import { useCallback, useMemo } from 'react';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useUrlState, enumParam, pageParam } from '../../../shared/hooks/useUrlState';
import { displayDelta, type ReportRow } from '../lib/reportsPresentation';

export type DetailFilter = 'all' | 'anomaly' | 'zero';
const FILTERS: readonly DetailFilter[] = ['all', 'anomaly', 'zero'];

export function filterRows(rows: ReportRow[], filter: DetailFilter): ReportRow[] {
  if (filter === 'anomaly') return rows.filter((r) => r.hadCounterReset);
  if (filter === 'zero') return rows.filter((r) => displayDelta(r) === 0);
  return rows;
}

/** `?detail=` (filtro) y `?dpage=` (página del detalle) — nombres propios para
 * no chocar con los de la pantalla (`client_id`/`period`, `useReportsPage`). */
const CODECS = { detail: enumParam(FILTERS, 'all'), dpage: pageParam };
type UrlPaging = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

/** Filtro client-side + paginación en memoria del "detalle por equipo"
 * (27/08/2026, "cada pantalla entra sin scroll"): preview y cierre devuelven
 * todas las líneas de una, así que la página se recorta acá a las filas que
 * caben en el alto que dejó el resto de la pantalla (`useFitRows`). Filtro y
 * página viven en la URL (la URL manda, ver `useUrlState`); si la lista o el
 * tamaño cambian y la página queda vacía, se muestra la última válida sin
 * persistir el clamp. */
export function useReportsDetailPaging(rows: ReportRow[]) {
  const fit = useFitRows({ estimate: 54 });
  const [url, patch] = useUrlState<UrlPaging>(CODECS);
  const filtered = useMemo(() => filterRows(rows, url.detail), [rows, url.detail]);
  const size = Math.max(1, fit.rows);
  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(url.dpage, totalPages - 1);
  const visible = useMemo(() => filtered.slice(page * size, (page + 1) * size), [filtered, page, size]);
  // Cambiar de filtro vuelve al principio: quedarse en la página 3 de un
  // subconjunto distinto no significa nada para el usuario.
  const setFilter = useCallback((detail: DetailFilter) => patch({ detail, dpage: 0 }), [patch]);
  const setPage = useCallback((dpage: number) => patch({ dpage }), [patch]);
  return { fit, filter: url.detail, setFilter, page, setPage, visible, totalPages, total: filtered.length, pageSize: size };
}

export type DetailPaging = ReturnType<typeof useReportsDetailPaging>;
