import { api } from '../../../shared/lib/api';
import type { ClientDirectoryResponse, ClientDirectoryRow, ClientSegment, ClientSortField, SortDir } from '../types/clientsDirectory';

const ESTADO_LABEL: Record<ClientDirectoryRow['estado'], string> = {
  activo: 'Activo', sin_contacto: 'Sin contacto', sin_reporte: 'Sin reporte',
};

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODA la cartera que matchea los filtros actuales, paginando en lotes de
 * 200 (el techo de `/clients/directory`) — no sólo la página visible: "Exportar CSV"
 * tiene que traer el resultado completo del filtro aplicado, no una muestra. */
async function fetchAllMatching(query: string, segment: ClientSegment, sortField: ClientSortField, sortDir: SortDir): Promise<ClientDirectoryRow[]> {
  const limit = 200;
  let offset = 0;
  let all: ClientDirectoryRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ sort: sortField, dir: sortDir, limit: String(limit), offset: String(offset) });
    if (query) params.set('q', query);
    if (segment !== 'todos') params.set('segment', segment);
    const data = await api.get<ClientDirectoryResponse>(`/clients/directory?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportClientsCsv(query: string, segment: ClientSegment, sortField: ClientSortField, sortDir: SortDir): Promise<void> {
  const rows = await fetchAllMatching(query, segment, sortField, sortDir);
  const header = ['Cliente', 'Estado', 'Contacto', 'Email', 'Pais', 'Monitores', 'Equipos', 'Alertas', 'Ultimo reporte'];
  const lines = [header, ...rows.map((r) => [
    r.name, ESTADO_LABEL[r.estado], r.contact_name ?? '', r.contact_email ?? '', r.country ?? '',
    r.monitor_count, r.device_count, r.alerts_count, r.last_report_at ?? '',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  // BOM (\uFEFF) al frente: sin esto Excel adivina mal el charset y rompe
  // tildes/enie en los nombres reales de la cartera (es-AR).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
