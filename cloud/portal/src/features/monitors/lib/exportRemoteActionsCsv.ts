import { api } from '../../../shared/lib/api';
import { formatShortDateTime } from '../../../shared/lib/formatters';
import {
  ACTION_LABELS, STATUS_LABELS,
  type RemoteActionBatchRow, type RemoteActionListResponse, type RemoteActionSegment, type SortDir,
} from '../types/remoteActions';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODOS los lotes que matchean el filtro actual, paginando en lotes
 * de 200 (el techo de `/remote-actions`) — no sólo la página visible, mismo
 * criterio que `exportClientsCsv`. */
async function fetchAllMatching(query: string, segment: RemoteActionSegment, sortDir: SortDir): Promise<RemoteActionBatchRow[]> {
  const limit = 200;
  let offset = 0;
  let all: RemoteActionBatchRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ dir: sortDir, limit: String(limit), offset: String(offset) });
    if (query) params.set('q', query);
    if (segment !== 'todos') params.set('segment', segment);
    const data = await api.get<RemoteActionListResponse>(`/remote-actions?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportRemoteActionsCsv(query: string, segment: RemoteActionSegment, sortDir: SortDir): Promise<void> {
  const rows = await fetchAllMatching(query, segment, sortDir);
  const header = ['Lote', 'Accion', 'Objetivo', 'Elementos', 'Estado', 'Programado', 'Completado'];
  const lines = [header, ...rows.map((r) => [
    `#${r.number}`, ACTION_LABELS[r.action] ?? r.action, r.name ?? '', r.total_items ?? 0,
    STATUS_LABELS[r.status] ?? r.status, formatShortDateTime(r.scheduled_at), r.completed_at ? formatShortDateTime(r.completed_at) : '',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  // BOM (\uFEFF) al frente: sin esto Excel adivina mal el charset (es-AR).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acciones-remotas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
