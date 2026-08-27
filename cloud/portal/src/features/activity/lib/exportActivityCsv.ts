import { api } from '../../../shared/lib/api';
import type { AuditLogItem, AuditLogsResponse } from '../../../shared/types/audit';
import { buildActivityQueryParams, type ActivityFiltersState } from '../hooks/useActivityPage';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODOS los eventos que matchean los filtros actuales, paginando en
 * lotes de 200 (el techo de `GET /audit-logs`) — mismo criterio que
 * `exportAlertsCsv.ts`. */
async function fetchAllMatching(filters: ActivityFiltersState, topOperatorUserId: string | null): Promise<AuditLogItem[]> {
  const limit = 200;
  let offset = 0;
  let all: AuditLogItem[] = [];
  for (;;) {
    const params = buildActivityQueryParams(filters, topOperatorUserId, 0, limit);
    params.set('offset', String(offset));
    const data = await api.get<AuditLogsResponse>(`/audit-logs?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length < limit) break;
  }
  return all;
}

export async function exportActivityCsv(filters: ActivityFiltersState, topOperatorUserId: string | null): Promise<void> {
  const rows = await fetchAllMatching(filters, topOperatorUserId);
  const header = ['Fecha', 'Acción', 'Categoría', 'Objetivo', 'Cliente', 'Usuario', 'IP'];
  const lines = [header, ...rows.map((i) => [
    i.created_at, i.action_label, i.category, i.target_label ?? i.target_id ?? '', i.client_name ?? '', i.user_username ?? '', i.ip_address ?? '',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
