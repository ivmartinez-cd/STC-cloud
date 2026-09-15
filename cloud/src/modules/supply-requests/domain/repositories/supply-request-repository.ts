import type { RequestReason, RequestStatus, SupplyRequest } from "../entities/supply-request";

export interface SupplyRequestEvent {
  id: string;
  requestId: string;
  kind: "status_change" | "comment" | "auto_complete";
  body: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  createdAt: Date;
}

export interface ListParams {
  clientId?: string;
  deviceId?: string;
  status?: RequestStatus;
  origin?: "auto" | "manual";
  limit: number;
  offset: number;
}

/** Alta (manual o del worker). El estado inicial siempre es `pending`. */
export interface SupplyRequestWrite {
  clientId: string;
  deviceId: string | null;
  deviceSerial: string | null;
  deviceLabel: string | null;
  supplyKey: string;
  supplyKind: string;
  supplyColor: string | null;
  description: string | null;
  sku: string | null;
  levelPct: number | null;
  remainingDays: number | null;
  supplySerial: string | null;
  externalRef: string | null;
  reason: RequestReason | null;
  monoPages: number | null;
  colorPages: number | null;
  totalPages: number | null;
  origin: "auto" | "manual";
  notes: string | null;
}

export interface EventWrite {
  kind: SupplyRequestEvent["kind"];
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
}

export interface SupplyRequestRepository {
  list(params: ListParams): Promise<{ items: SupplyRequest[]; total: number }>;
  stats(clientId?: string): Promise<Record<string, number>>;
  /** Ventana temporal sobre `closed_at` — completadas + desglose por origen, para el % de automatización. */
  statsWindow(clientId: string | undefined, from: Date, to: Date): Promise<{ completed: number; autoCount: number; manualCount: number }>;
  findById(id: string): Promise<SupplyRequest | null>;
  eventsOf(id: string): Promise<SupplyRequestEvent[]>;
  /** Devuelve null si chocó con el índice único parcial (pedido auto abierto ya existente). */
  create(data: SupplyRequestWrite, createdBy: string | null): Promise<SupplyRequest | null>;
  setStatus(id: string, status: RequestStatus, closedAt: Date | null): Promise<void>;
  /** Marca la fecha en que se detectó el cartucho reemplazado (columna aparte de `closed_at`: un pedido ignorado también se cierra). */
  setReplacedAt(id: string, replacedAt: Date): Promise<void>;
  addEvent(requestId: string, event: EventWrite): Promise<void>;
  /** Pedidos abiertos con device para el chequeo de auto-completado. */
  listOpenWithDevice(): Promise<SupplyRequest[]>;
}
