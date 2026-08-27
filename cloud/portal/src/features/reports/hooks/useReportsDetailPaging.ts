import { useMemo, useState } from 'react';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';
import { displayDelta, type ReportRow } from '../lib/reportsPresentation';

export type DetailFilter = 'all' | 'anomaly' | 'zero';

export function filterRows(rows: ReportRow[], filter: DetailFilter): ReportRow[] {
  if (filter === 'anomaly') return rows.filter((r) => r.hadCounterReset);
  if (filter === 'zero') return rows.filter((r) => displayDelta(r) === 0);
  return rows;
}

/** Filtro client-side + paginación en memoria del "detalle por equipo"
 * (27/08/2026, "cada pantalla entra sin scroll"): preview y cierre devuelven
 * todas las líneas de una, así que la página se recorta acá a las filas que
 * caben en el alto que dejó el resto de la pantalla (`useFitRows`). */
export function useReportsDetailPaging(rows: ReportRow[]) {
  const fit = useFitRows({ estimate: 54 });
  const [filter, setFilterState] = useState<DetailFilter>('all');
  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const paging = useClientPagination(filtered, fit.rows);
  // Cambiar de filtro vuelve al principio: quedarse en la página 3 de un
  // subconjunto distinto no significa nada para el usuario.
  const setFilter = (f: DetailFilter) => { setFilterState(f); paging.setPage(0); };
  return { fit, filter, setFilter, ...paging };
}

export type DetailPaging = ReturnType<typeof useReportsDetailPaging>;
