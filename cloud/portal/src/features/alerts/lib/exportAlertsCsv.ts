import { api } from '../../../shared/lib/api';
import type { Alert } from '../../../shared/types/alerts';
import { buildAlertsQueryParams, type AlertFiltersState } from '../hooks/useAlertsPage';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODAS las alertas que matchean los filtros actuales, paginando en
 * lotes de 200 (el techo de `GET /alerts`) — no sólo la página visible, mismo
 * criterio que `exportDeviceInventoryCsv.ts`. */
async function fetchAllMatching(filters: AlertFiltersState): Promise<Alert[]> {
  const limit = 200;
  let offset = 0;
  let all: Alert[] = [];
  for (;;) {
    const params = buildAlertsQueryParams(filters, 0);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const rows = await api.get<Alert[]>(`/alerts?${params.toString()}`);
    all = all.concat(rows);
    offset += limit;
    if (rows.length < limit) break;
  }
  return all;
}

export async function exportAlertsCsv(filters: AlertFiltersState): Promise<void> {
  const rows = await fetchAllMatching(filters);
  const header = ['Severidad', 'Cliente', 'Equipo', 'Código', 'Motivo', 'Clase', 'Detectada', 'Estado'];
  const lines = [header, ...rows.map((a) => [
    a.severity, a.client_name ?? '', a.device_name || a.agent_name || '', a.type, a.alert_reason || a.message,
    a.alert_class ?? '', a.created_at, a.resolved ? 'Resuelta' : a.acknowledged ? 'Reconocida' : 'Sin reconocer',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alertas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
