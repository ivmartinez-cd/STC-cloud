import { api } from '../../../shared/lib/api';
import type { DeviceDirectoryResponse, DeviceDirectoryRow, DeviceDirectorySegment, SortDir } from '../types/deviceDirectory';

const ESTADO_LABEL: Record<DeviceDirectoryRow['estado'], string> = {
  en_linea: 'En línea', sin_contacto: 'Sin contacto', dado_de_baja: 'Dado de baja',
};

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODO el inventario que matchea los filtros actuales, paginando en lotes de
 * 200 (el techo de `/devices/directory`) — no sólo la página visible, mismo criterio
 * que `exportClientsCsv.ts`. Aplana los `groups` (la respuesta viene agrupada por
 * cliente server-side) a filas sueltas para el CSV. */
async function fetchAllMatching(query: string, segment: DeviceDirectorySegment, sortDir: SortDir, includeDecommissioned: boolean): Promise<DeviceDirectoryRow[]> {
  const limit = 200;
  let offset = 0;
  let all: DeviceDirectoryRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ sort: 'last_seen', dir: sortDir, limit: String(limit), offset: String(offset) });
    if (query) params.set('q', query);
    if (segment !== 'todos') params.set('segment', segment);
    if (includeDecommissioned) params.set('include', 'decommissioned');
    const data = await api.get<DeviceDirectoryResponse>(`/devices/directory?${params.toString()}`);
    const rows = data.groups.flatMap((g) => g.rows);
    all = all.concat(rows);
    offset += limit;
    if (rows.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportDeviceInventoryCsv(query: string, segment: DeviceDirectorySegment, sortDir: SortDir, includeDecommissioned: boolean): Promise<void> {
  const rows = await fetchAllMatching(query, segment, sortDir, includeDecommissioned);
  const header = ['Cliente', 'Dispositivo', 'Marca', 'Modelo', 'Serie', 'IP', 'Agente', 'Estado', 'Consumible min %', 'Ult. contacto', 'Alertas'];
  const lines = [header, ...rows.map((r) => [
    r.client_name, r.name ?? '', r.brand ?? '', r.model ?? '', r.serial_number ?? '', r.ip_address ?? '',
    r.agent_name ?? '', ESTADO_LABEL[r.estado], r.consumible_pct ?? '', r.last_seen ?? '', r.alerts_count,
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  // BOM (﻿) al frente — mismo motivo que `exportClientsCsv.ts` (Excel/es-AR).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dispositivos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
