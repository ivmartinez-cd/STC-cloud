import type { Knex } from "knex";
import { OPEN_STATUSES, type RequestStatus, type SupplyRequest } from "../../domain/entities/supply-request";
import type {
  EventWrite,
  ListParams,
  SupplyRequestEvent,
  SupplyRequestRepository,
  SupplyRequestWrite,
} from "../../domain/repositories/supply-request-repository";

const TABLE = "supply_requests";
const EVENTS = "supply_request_events";

/* eslint-disable @typescript-eslint/no-explicit-any */
function identityOf(row: any) {
  return {
    id: row.id,
    clientId: row.client_id,
    deviceId: row.device_id,
    deviceSerial: row.device_serial,
    deviceLabel: row.device_label,
    status: row.status,
    origin: row.origin,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    notes: row.notes,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function supplyOf(row: any) {
  return {
    supplyKey: row.supply_key,
    supplyKind: row.supply_kind,
    supplyColor: row.supply_color,
    description: row.description,
    sku: row.sku,
    levelPct: row.level_pct,
    remainingDays: row.remaining_days,
  };
}

function toEntity(row: any, possibleDuplicateOf: string | null = null): SupplyRequest {
  return { ...identityOf(row), ...supplyOf(row), possibleDuplicateOf };
}

function toEventEntity(row: any): SupplyRequestEvent {
  return {
    id: row.id,
    requestId: row.request_id,
    kind: row.kind,
    body: row.body,
    metadata: row.metadata,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

function toRow(data: SupplyRequestWrite, createdBy: string | null): Record<string, unknown> {
  return {
    client_id: data.clientId,
    device_id: data.deviceId,
    device_serial: data.deviceSerial,
    device_label: data.deviceLabel,
    supply_key: data.supplyKey,
    supply_kind: data.supplyKind,
    supply_color: data.supplyColor,
    description: data.description,
    sku: data.sku,
    level_pct: data.levelPct,
    remaining_days: data.remainingDays,
    origin: data.origin,
    notes: data.notes,
    created_by: createdBy,
  };
}

function applyFilters(q: Knex.QueryBuilder, params: ListParams): Knex.QueryBuilder {
  if (params.clientId) q.where("client_id", params.clientId);
  if (params.deviceId) q.where("device_id", params.deviceId);
  if (params.status) q.where("status", params.status);
  if (params.origin) q.where("origin", params.origin);
  return q;
}

export class KnexSupplyRequestRepository implements SupplyRequestRepository {
  constructor(private readonly db: Knex) {}

  /** id → id del OTRO pedido abierto con el mismo (device_id, supply_key) —
   * ver docblock de `possibleDuplicateOf` en la entidad. Sólo entre pedidos
   * ABIERTOS: uno ya cerrado no es "un duplicado activo". */
  private async duplicateSiblingIds(clientId?: string): Promise<Map<string, string>> {
    const rows = await this.db(TABLE)
      .whereIn("status", [...OPEN_STATUSES]).whereNotNull("device_id")
      .modify((q) => { if (clientId) q.where("client_id", clientId); })
      .select("id", "device_id", "supply_key");
    const groups = new Map<string, string[]>();
    for (const r of rows) {
      const key = `${r.device_id}:${r.supply_key}`;
      groups.set(key, [...(groups.get(key) ?? []), r.id]);
    }
    const dup = new Map<string, string>();
    for (const ids of groups.values()) {
      if (ids.length > 1) for (const id of ids) dup.set(id, ids.find((x) => x !== id)!);
    }
    return dup;
  }

  async list(params: ListParams): Promise<{ items: SupplyRequest[]; total: number }> {
    const base = applyFilters(this.db(TABLE), params);
    const [[{ count }], rows, dup] = await Promise.all([
      base.clone().count("* as count"),
      base.clone().orderBy("opened_at", "desc").limit(Math.min(params.limit, 200)).offset(params.offset),
      this.duplicateSiblingIds(params.clientId),
    ]);
    return { items: rows.map((r: any) => toEntity(r, dup.get(r.id) ?? null)), total: Number(count) };
  }

  async stats(clientId?: string): Promise<Record<string, number>> {
    const q = this.db(TABLE).select("status").count("* as count").groupBy("status");
    if (clientId) q.where("client_id", clientId);
    const rows = await q;
    return Object.fromEntries(rows.map((r: any) => [r.status, Number(r.count)]));
  }

  /** "Completadas en agosto (30) · automatización 91% (30 de 33 sin
   * intervención)" (handoff hifi #3, fase 3, 26/08/2026) — ventana temporal
   * sobre `closed_at`, a diferencia de `stats()` (backlog actual, sin ventana). */
  async statsWindow(clientId: string | undefined, from: Date, to: Date): Promise<{ completed: number; autoCount: number; manualCount: number }> {
    const rows = await this.db(TABLE)
      .where("status", "completed").whereBetween("closed_at", [from, to])
      .modify((q) => { if (clientId) q.where("client_id", clientId); })
      .select("origin");
    const autoCount = rows.filter((r: any) => r.origin === "auto").length;
    return { completed: rows.length, autoCount, manualCount: rows.length - autoCount };
  }

  async findById(id: string): Promise<SupplyRequest | null> {
    const row = await this.db(TABLE).where({ id }).first();
    return row ? toEntity(row) : null;
  }

  async eventsOf(id: string): Promise<SupplyRequestEvent[]> {
    const rows = await this.db(EVENTS).where("request_id", id).orderBy("created_at", "asc");
    return rows.map(toEventEntity);
  }

  async create(data: SupplyRequestWrite, createdBy: string | null): Promise<SupplyRequest | null> {
    // ON CONFLICT contra el índice único parcial de pedidos auto abiertos —
    // mismo patrón raw que alertService.openAlert / incidentWorker.
    const [row] = await this.db(TABLE)
      .insert(toRow(data, createdBy))
      .onConflict(
        this.db.raw(
          "(device_id, supply_key) WHERE status IN ('pending','reviewed','processed') AND origin = 'auto' AND device_id IS NOT NULL"
        ) as any
      )
      .ignore()
      .returning("*");
    return row ? toEntity(row) : null;
  }

  async setStatus(id: string, status: RequestStatus, closedAt: Date | null): Promise<void> {
    await this.db(TABLE).where({ id }).update({ status, closed_at: closedAt, updated_at: new Date() });
  }

  async addEvent(requestId: string, event: EventWrite): Promise<void> {
    await this.db(EVENTS).insert({
      request_id: requestId,
      kind: event.kind,
      body: event.body ?? null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      user_id: event.userId ?? null,
    });
  }

  async listOpenWithDevice(): Promise<SupplyRequest[]> {
    const rows = await this.db(TABLE)
      .whereIn("status", [...OPEN_STATUSES])
      .whereNotNull("device_id");
    return rows.map((r: any) => toEntity(r));
  }
}
