import { api } from '../../../shared/lib/api';
import { REVISION_LABEL } from '../components/pendingQueueFormat';
import type { PendingQueueResponse, PendingQueueRow, PendingQueueSegment } from '../types/pendingDevices';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface ExportFilters { query: string; clientId: string; segment: PendingQueueSegment }

/** Recorre TODA la cola que matchea los filtros actuales, paginando en lotes de
 * 200 (techo de `/devices/pending/directory`) — no sólo la página visible,
 * mismo criterio que `exportDeviceInventoryCsv.ts`. */
async function fetchAllMatching(filters: ExportFilters): Promise<PendingQueueRow[]> {
  const limit = 200;
  let offset = 0;
  let all: PendingQueueRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.query) params.set('q', filters.query);
    if (filters.clientId) params.set('client_id', filters.clientId);
    if (filters.segment !== 'todos') params.set('segment', filters.segment);
    const data = await api.get<PendingQueueResponse>(`/devices/pending/directory?${params.toString()}`);
    all = all.concat(data.rows);
    offset += limit;
    if (data.rows.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportPendingQueueCsv(filters: ExportFilters): Promise<void> {
  const rows = await fetchAllMatching(filters);
  const header = ['Cliente sugerido', 'Equipo', 'Marca', 'Modelo', 'Serie', 'Hostname', 'IP', 'Detectado por', 'Revisión', 'Descubierto', 'Días en espera'];
  const lines = [header, ...rows.map((r) => [
    r.client_name ?? '', r.name ?? '', r.brand ?? '', r.model ?? '', r.serial_number ?? '', r.hostname ?? '',
    r.ip_address ?? '', r.agent_name ?? '', REVISION_LABEL[r.revision], r.created_at, r.wait_days,
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  // BOM al frente — mismo motivo que `exportDeviceInventoryCsv.ts` (Excel/es-AR).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dispositivos-pendientes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
