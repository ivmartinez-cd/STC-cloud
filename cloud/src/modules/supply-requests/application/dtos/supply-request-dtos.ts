import type { SupplyRequest } from "../../domain/entities/supply-request";
import type { SupplyRequestEvent } from "../../domain/repositories/supply-request-repository";

/** Contrato HTTP en snake_case (mismo criterio que el resto de la API). */
export interface SupplyRequestViewDto {
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
  status: SupplyRequest["status"];
  origin: SupplyRequest["origin"];
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  possible_duplicate_of: string | null;
}

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

function identityView(r: SupplyRequest) {
  return {
    id: r.id,
    client_id: r.clientId,
    device_id: r.deviceId,
    device_serial: r.deviceSerial,
    device_label: r.deviceLabel,
    status: r.status,
    origin: r.origin,
    opened_at: new Date(r.openedAt).toISOString(),
    closed_at: iso(r.closedAt),
    notes: r.notes,
    possible_duplicate_of: r.possibleDuplicateOf,
  };
}

function supplyView(r: SupplyRequest) {
  return {
    supply_key: r.supplyKey,
    supply_kind: r.supplyKind,
    supply_color: r.supplyColor,
    description: r.description,
    sku: r.sku,
    level_pct: r.levelPct,
    remaining_days: r.remainingDays,
  };
}

export function toViewDto(r: SupplyRequest): SupplyRequestViewDto {
  return { ...identityView(r), ...supplyView(r) };
}

export interface SupplyRequestEventViewDto {
  id: string;
  kind: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

export function toEventViewDto(e: SupplyRequestEvent): SupplyRequestEventViewDto {
  return {
    id: e.id,
    kind: e.kind,
    body: e.body,
    metadata: e.metadata,
    user_id: e.userId,
    created_at: new Date(e.createdAt).toISOString(),
  };
}
