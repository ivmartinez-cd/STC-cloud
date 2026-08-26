import { api } from '../../../shared/lib/api';
import type { EmailLogRow } from '../types/emailLog';
import { STATUS_LABELS } from './emailLogPresentation';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Recorre TODOS los intentos que matchean los filtros actuales, paginando en
 * lotes de 200 (el techo de `GET /email-log`) — mismo criterio que
 * `exportDeviceInventoryCsv.ts` / `exportAlertsCsv.ts`. */
async function fetchAllMatching(query: string, status: string): Promise<EmailLogRow[]> {
  const limit = 200;
  let offset = 0;
  let all: EmailLogRow[] = [];
  for (;;) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query.trim().length >= 2) params.set('q', query.trim());
    if (status !== 'todos') params.set('status', status);
    const data = await api.get<{ items: EmailLogRow[]; total: number }>(`/email-log?${params.toString()}`);
    all = all.concat(data.items);
    offset += limit;
    if (data.items.length === 0 || offset >= data.total) break;
  }
  return all;
}

export async function exportEmailLogCsv(query: string, status: string, clientName: (id: string | null) => string): Promise<void> {
  const rows = await fetchAllMatching(query, status);
  const header = ['Fecha', 'Cliente', 'Evento', 'Destinatario', 'Asunto', 'Resultado', 'Error'];
  const lines = [header, ...rows.map((r) => [
    r.created_at, clientName(r.client_id), r.event, r.recipient ?? '', r.subject, STATUS_LABELS[r.status], r.error ?? '',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `correo-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
