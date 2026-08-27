import { api } from '../../../shared/lib/api';
import type { Incident } from '../../../shared/types/incidents';
import { buildIncidentsQueryParams, type IncidentFiltersState } from '../hooks/useIncidentsPage';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODOS los incidentes que matchean los filtros actuales, paginando
 * en lotes de 200 (el techo de `GET /incidents`) — mismo criterio que
 * `exportAlertsCsv.ts`. */
async function fetchAllMatching(filters: IncidentFiltersState): Promise<Incident[]> {
  const limit = 200;
  let offset = 0;
  let all: Incident[] = [];
  for (;;) {
    const params = buildIncidentsQueryParams(filters, 0, limit);
    params.set('offset', String(offset));
    const data = await api.get<{ items: Incident[]; total: number }>(`/incidents?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length < limit) break;
  }
  return all;
}

export async function exportIncidentsCsv(filters: IncidentFiltersState): Promise<void> {
  const rows = await fetchAllMatching(filters);
  const header = ['Número', 'Título', 'Cliente', 'Equipo', 'Clase', 'Origen', 'Estado', 'Apertura', 'Antigüedad (seg)'];
  const lines = [header, ...rows.map((inc) => [
    inc.number, inc.title, inc.client_name ?? '', inc.device_label || inc.device_serial || '',
    inc.class, inc.origin, inc.status, inc.opened_at, inc.aging_seconds,
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incidentes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
