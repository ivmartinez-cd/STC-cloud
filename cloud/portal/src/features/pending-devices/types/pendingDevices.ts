// Handoff hifi "Dispositivos pendientes" (25/08/2026) — tipos del wire de
// `GET /devices/pending/directory` y `GET /devices/pending/summary`. Cola
// CROSS-CLIENTE (a diferencia de la vieja `/clients/:id/pending-devices`,
// scopeada — esa ruta sigue existiendo para la tarjeta de Cliente — Detalle,
// esta pantalla ya no la usa). `revision`/`wait_days` se calculan en el
// SERVIDOR, nunca acá — mismo criterio que `deviceDirectory.ts`.

export type PendingRevision = 'nuevo' | 'duplicado' | 'sin_cliente';
export type PendingQueueSegment = 'todos' | 'posibles_duplicados' | 'mas_7_dias' | 'sin_cliente';
export type SortDir = 'asc' | 'desc';

export interface PendingQueueRow {
  id: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  hostname: string | null;
  ip_address: string | null;
  agent_id: string | null;
  agent_name: string | null;
  client_id: string | null;
  client_name: string | null;
  created_at: string;
  wait_days: number;
  revision: PendingRevision;
}

export interface PendingQueueResponse {
  rows: PendingQueueRow[];
  total: number;
}

export interface PendingQueueSummary {
  pending_total: number;
  pending_clients: number;
  discovered_today: number;
  discovered_yesterday: number;
  waiting_7d_plus: number;
  possible_duplicates: number;
  approved_this_month: number;
  ignored_this_month: number;
}

export interface PendingQueueActionSkip { id: string; reason: string }
export interface PendingQueueActionResult { approved?: number; ignored?: number; skipped: PendingQueueActionSkip[] }
