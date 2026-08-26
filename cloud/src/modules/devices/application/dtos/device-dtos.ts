import type { DeviceScope } from "../../domain/entities/device";
import type { DeviceUpdateBody } from "../../domain/services/device-rules";

export interface Actor {
  userId: string | null;
  ipAddress: string | null;
}

export interface ScopedId {
  id: string;
  scope: DeviceScope;
}

export interface ListDevicesInput {
  scope: DeviceScope;
  include?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface DeviceReadingsInput extends ScopedId {
  from?: string;
  to?: string;
  limit?: string;
}

export interface DeviceUsageHistoryInput extends ScopedId {
  granularity?: string;
  limit?: string;
}

export interface ListDuplicatesInput {
  scope: DeviceScope;
  clientId?: string;
  agentId?: string;
}

export interface UpdateDeviceInput extends ScopedId, Actor {
  body: DeviceUpdateBody;
}

export interface DecommissionDeviceInput extends ScopedId, Actor {
  reason?: string;
}

export interface RecommissionDeviceInput extends ScopedId, Actor {
  reason?: string;
}

export interface MoveDeviceInput extends ScopedId, Actor {
  agentId?: string;
  reason?: string;
  confirmClientChange?: boolean;
}

export interface DecommissionStaleInput extends Actor {
  agentId: string;
  inactiveDays?: number;
  dryRun?: boolean;
  reason?: string;
}

export interface MergeDeviceRequest extends ScopedId, Actor {
  sourceDeviceId?: string;
  reason?: string;
  onOverlap?: "abort" | "keep_target" | "keep_source";
  dryRun?: boolean;
  force?: boolean;
}

export interface SetMonitorStateInput extends Actor {
  deviceId: string;
  state: string;
  reason?: string | null;
}

export interface ScopedMonitorStateInput extends ScopedId, Actor {
  state?: string;
  reason?: string;
}

export interface BulkMonitorStateInput extends Actor {
  scope: DeviceScope;
  ids?: string[];
  state?: string;
  reason?: string;
}

export interface UnignoreDeviceInput extends ScopedId, Actor {
  reason?: string;
}

export interface BulkDecommissionInput extends Actor {
  scope: DeviceScope;
  ids: string[];
  reason: string;
  dryRun?: boolean;
}

export interface BulkRecommissionInput extends Actor {
  scope: DeviceScope;
  ids: string[];
  reason?: string | null;
}

export interface BulkMoveInput extends Actor {
  scope: DeviceScope;
  ids: string[];
  agentId: string;
  reason: string;
  confirmClientChange?: boolean;
}

export interface ListPendingInput {
  clientId: string;
  limit?: number;
  offset?: number;
  q?: string;
  agentId?: string;
}

export interface RegistrationActionInput {
  /** `null` = equipo sin cliente sugerido ("sin_cliente", handoff hifi "Dispositivos
   * pendientes" 25/08/2026) — `ApprovePendingQueueUseCase`/`IgnorePendingQueueUseCase`
   * agrupan por el `client_id` REAL de cada fila y llaman este mismo caso de uso una
   * vez por grupo, `null` incluido. `classifyRegistration` compara con `===`, que ya
   * funciona igual para `null` que para cualquier uuid. */
  clientId: string | null;
  deviceIds: string[];
  actorId?: string | null;
  ip?: string | null;
}

export interface UnignoreInput {
  deviceId: string;
  reason?: string | null;
  actorId?: string | null;
  ip?: string | null;
}
