import { api } from '../../../shared/lib/api';
import type { AgentDirectoryResponse, AgentDirectoryRow, AgentSegment, SortDir } from '../types/agentsDirectory';

const ESTADO_LABEL: Record<AgentDirectoryRow['estado'], string> = {
  reportando: 'Reportando', sin_senal: 'Sin señal', inactivo: 'Inactivo',
};

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODA la flota que matchea los filtros actuales, paginando en lotes
 * de 200 (el techo de `/agents/directory`) — mismo criterio que
 * `exportClientsCsv.ts`: "Exportar" trae el resultado completo del filtro
 * aplicado, no sólo la página visible. */
async function fetchAllMatching(query: string, segment: AgentSegment, sortDir: SortDir): Promise<AgentDirectoryRow[]> {
  const limit = 200;
  let offset = 0;
  let all: AgentDirectoryRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ dir: sortDir, limit: String(limit), offset: String(offset) });
    if (query) params.set('q', query);
    if (segment !== 'todos') params.set('segment', segment);
    const data = await api.get<AgentDirectoryResponse>(`/agents/directory?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportAgentsCsv(query: string, segment: AgentSegment, sortDir: SortDir): Promise<void> {
  const rows = await fetchAllMatching(query, segment, sortDir);
  const header = ['Nodo', 'Hardware ID', 'Cliente', 'Version', 'Estado', 'Ultima senal', 'Equipos'];
  const lines = [header, ...rows.map((r) => [
    r.name, r.hardware_id ?? '', r.client_name ?? '', r.version ?? '', ESTADO_LABEL[r.estado], r.last_seen ?? '', r.device_count,
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  // BOM al frente — mismo motivo que `exportClientsCsv.ts` (Excel/es-AR
  // adivina mal el charset y rompe tildes/enie sin esto).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nodos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
