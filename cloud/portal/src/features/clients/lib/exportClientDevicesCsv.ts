import { api } from '../../../shared/lib/api';
import type { ClientDeviceDirectoryResponse, ClientDeviceDirectoryRow, ClientDeviceSegment, ClientDeviceSortField, SortDir } from '../types/clientDetail';

const ESTADO_LABEL: Record<ClientDeviceDirectoryRow['estado'], string> = {
  en_linea: 'En línea', sin_conexion: 'Sin conexión', sin_reporte: 'Sin reporte',
};

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODOS los dispositivos que matchean el filtro actual, paginando en lotes
 * de 200 (mismo criterio que `exportClientsCsv.ts`) — no sólo la página visible. */
async function fetchAllMatching(
  clientId: string, query: string, segment: ClientDeviceSegment, sortField: ClientDeviceSortField, sortDir: SortDir
): Promise<ClientDeviceDirectoryRow[]> {
  const limit = 200;
  let offset = 0;
  let all: ClientDeviceDirectoryRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ sort: sortField, dir: sortDir, limit: String(limit), offset: String(offset) });
    if (query) params.set('q', query);
    if (segment !== 'todos') params.set('segment', segment);
    const data = await api.get<ClientDeviceDirectoryResponse>(`/clients/${clientId}/devices/directory?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportClientDevicesCsv(
  clientId: string, query: string, segment: ClientDeviceSegment, sortField: ClientDeviceSortField, sortDir: SortDir
): Promise<void> {
  const rows = await fetchAllMatching(clientId, query, segment, sortField, sortDir);
  const header = ['Marca', 'Modelo', 'Serie', 'Ubicacion', 'Estado', 'Consumible %', 'Alertas', 'Ultimo reporte'];
  const lines = [header, ...rows.map((r) => [
    r.brand ?? '', r.model ?? '', r.serial_number ?? '', r.location ?? '', ESTADO_LABEL[r.estado],
    r.consumible_pct ?? '', r.alerts_count, r.last_seen ?? '',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  // BOM (\uFEFF) al frente — mismo motivo que `exportClientsCsv.ts` (charset en Excel/es-AR).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dispositivos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
