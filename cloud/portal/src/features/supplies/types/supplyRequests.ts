export type SupplyRequestStatus =
  | 'pending' | 'reviewed' | 'processed' | 'completed' | 'ignored' | 'cancelled';

export interface SupplyRequest {
  id: string;
  client_id: string;
  device_id: string | null;
  device_serial: string | null;
  device_label: string | null;
  supply_key: string;
  supply_kind: string;
  supply_color: string | null;
  description: string | null;
  sku: string | null;
  level_pct: number | null;
  remaining_days: number | null;
  status: SupplyRequestStatus;
  origin: 'auto' | 'manual';
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  possible_duplicate_of: string | null;
}

export interface SupplyRequestStatsWindow {
  completed: number;
  autoCount: number;
  manualCount: number;
}
export type SupplyRequestStats = Record<SupplyRequestStatus, number> & { window: SupplyRequestStatsWindow };

export interface SupplyRequestEvent {
  id: string;
  kind: 'status_change' | 'comment' | 'auto_complete';
  body: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

export type SupplyRequestDetail = SupplyRequest & { events: SupplyRequestEvent[] };

export const SUPPLY_REQUEST_STATUS_LABELS: Record<SupplyRequestStatus, string> = {
  pending: 'Pendiente',
  reviewed: 'Consultada',
  processed: 'Procesada',
  completed: 'Completada',
  ignored: 'Ignorada',
  cancelled: 'Cancelada',
};

export const SUPPLY_REQUEST_STATUS_COLORS: Record<SupplyRequestStatus, string> = {
  pending: 'bg-rose-50 text-rose-600',
  reviewed: 'bg-amber-50 text-amber-600',
  processed: 'bg-blue-50 text-blue-600',
  completed: 'bg-emerald-50 text-emerald-600',
  ignored: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
};

/** Transiciones que la UI ofrece por estado (el backend valida igual). */
export const NEXT_STATUSES: Record<SupplyRequestStatus, SupplyRequestStatus[]> = {
  pending: ['reviewed', 'processed', 'completed', 'ignored', 'cancelled'],
  reviewed: ['processed', 'completed', 'ignored', 'cancelled'],
  processed: ['completed', 'ignored', 'cancelled'],
  completed: [],
  ignored: [],
  cancelled: [],
};
