import { api } from '../../../shared/lib/api';
import type { FleetSupplyRow, FleetSuppliesResponse } from '../../../shared/types/supplies';
import { buildSuppliesParams, type UrgencyFilter } from '../hooks/useSuppliesPage';
import type { SupplyKind } from '../../../shared/types/supplies';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchAllMatching(f: { query: string; clientId: string; kind: SupplyKind | ''; urgency: UrgencyFilter }): Promise<FleetSupplyRow[]> {
  const limit = 200;
  let offset = 0;
  let all: FleetSupplyRow[] = [];
  for (;;) {
    const params = buildSuppliesParams(f, 0);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const data = await api.get<FleetSuppliesResponse>(`/supplies?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportSuppliesCsv(f: { query: string; clientId: string; kind: SupplyKind | ''; urgency: UrgencyFilter }): Promise<void> {
  const rows = await fetchAllMatching(f);
  const header = ['Cliente', 'Equipo', 'Serie', 'Sede', 'Consumible', 'Color', 'SKU', 'Nivel %', 'Pág. restantes', 'Urgencia'];
  const lines = [header, ...rows.map((r) => [
    r.client_name ?? '', r.device_model ?? '', r.device_serial ?? '', r.agent_name ?? '', r.description, r.color,
    r.code ?? '', r.percentage ?? '', r.remainingPages ?? '', r.urgency,
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consumibles-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
