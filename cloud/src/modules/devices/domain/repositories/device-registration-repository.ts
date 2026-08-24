import type { DeviceRow, PendingDeviceRow } from "../entities/device";

export interface PendingQuery {
  clientId: string;
  limit?: number;
  offset?: number;
  q?: string;
  agentId?: string;
}

export interface RegistrationRow {
  id: string;
  client_id: string | null;
  registration_state: string;
}

/** Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS). */
export interface DeviceRegistrationRepository {
  /** Sólo equipos VIVOS (ni de baja ni fusionados). Techo 200 por página. */
  listPending(query: PendingQuery): Promise<{ items: PendingDeviceRow[]; total: number }>;
  findRegistrationRows(ids: string[]): Promise<RegistrationRow[]>;
  markRegistered(ids: string[], by: string | null): Promise<void>;
  markIgnored(ids: string[], by: string | null, reason: string): Promise<void>;
  findById(id: string): Promise<DeviceRow | null>;
  /** `ignored` → `pending`, limpiando los campos de ignorado. */
  unignore(id: string): Promise<DeviceRow>;
}
