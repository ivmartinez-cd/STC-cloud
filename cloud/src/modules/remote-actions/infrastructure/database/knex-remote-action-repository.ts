import type { Knex } from "knex";
import { REMOTE_ACTIONS } from "../../domain/entities/remote-action-batch";
import type {
  BatchItemState,
  BatchStatus,
  RemoteAction,
  RemoteActionBatch,
  RemoteActionSegment,
} from "../../domain/entities/remote-action-batch";
import { REMOTE_ACTION_CATALOG } from "../../domain/entities/remote-action-catalog";
import type { RemoteActionSummary, RemoteActionTypeBreakdown } from "../../domain/entities/remote-action-insights";
import { summarizeStatusCounts, summarizeTypeBreakdown } from "../../domain/services/remote-action-insights";

const BATCHES = "remote_action_batches";
const ITEMS = "remote_action_items";
const WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BatchTarget {
  agentId: string;
  deviceId?: string | null;
  deviceIp?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEntity(row: any): RemoteActionBatch {
  return {
    id: row.id,
    number: Number(row.number),
    action: row.action,
    name: row.name,
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export class KnexRemoteActionRepository {
  constructor(private readonly db: Knex) {}

  async create(
    params: { action: RemoteAction; name: string | null; scheduledAt: Date; targets: BatchTarget[] },
    createdBy: string | null
  ): Promise<RemoteActionBatch> {
    return this.db.transaction(async (trx) => {
      const [row] = await trx(BATCHES).insert({
        action: params.action, name: params.name,
        scheduled_at: params.scheduledAt, created_by: createdBy,
      }).returning("*");
      await trx(ITEMS).insert(params.targets.map((t) => ({
        batch_id: row.id, agent_id: t.agentId,
        device_id: t.deviceId ?? null, device_ip: t.deviceIp ?? null,
      })));
      return toEntity(row);
    });
  }

  /** `q`/`segment` filtran; `dir` ordena por `scheduled_at` (única columna
   * ordenable de la tabla — handoff hifi "Acciones remotas"). `q` matchea
   * nº de lote, nombre, el enum de acción, o la ETIQUETA humana de la
   * acción (vía `REMOTE_ACTION_CATALOG`, para que "reiniciar" encuentre
   * RESTART_PRINTER aunque el usuario no escriba el enum). */
  async list(params: {
    limit: number; offset: number; q?: string; segment?: RemoteActionSegment; dir?: "asc" | "desc";
  }): Promise<{ items: (RemoteActionBatch & { total_items: number })[]; total: number }> {
    const { limit, offset, q, segment, dir } = params;
    const filtered = this.db(BATCHES);
    if (segment && segment !== "todos") this.applySegment(filtered, segment);
    const term = q?.trim();
    if (term) this.applySearch(filtered, term);

    const [{ count }] = await filtered.clone().count("* as count");
    const rows = await filtered
      .select(`${BATCHES}.*`, this.db(ITEMS).count("*").whereRaw(`${ITEMS}.batch_id = ${BATCHES}.id`).as("total_items"))
      .orderBy("scheduled_at", dir === "asc" ? "asc" : "desc")
      .limit(Math.min(limit, 200)).offset(offset);
    return { items: rows.map((r: any) => ({ ...toEntity(r), total_items: Number(r.total_items) })), total: Number(count) };
  }

  private applySegment(b: Knex.QueryBuilder, segment: Exclude<RemoteActionSegment, "todos">): void {
    if (segment === "con_errores") b.where("status", "completed_with_errors");
    else if (segment === "en_curso") b.whereIn("status", ["sent", "scheduled"]);
    else if (segment === "cancelados") b.where("status", "cancelled");
    else if (segment === "hoy") b.whereRaw("scheduled_at::date = CURRENT_DATE");
  }

  private applySearch(b: Knex.QueryBuilder, term: string): void {
    const lower = term.toLowerCase();
    const matchingActions = REMOTE_ACTIONS.filter((a) => REMOTE_ACTION_CATALOG[a].label.toLowerCase().includes(lower));
    b.where((w) => {
      w.whereRaw(`${BATCHES}.number::text ILIKE ?`, [`%${term}%`])
        .orWhereRaw(`${BATCHES}.name ILIKE ?`, [`%${term}%`])
        .orWhereRaw(`${BATCHES}.action ILIKE ?`, [`%${term}%`]);
      if (matchingActions.length) w.orWhereIn(`${BATCHES}.action`, matchingActions as unknown as string[]);
    });
  }

  private countsByStatus(rows: { status: string; count: string | number }[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  }

  /** Tira de métricas de "Acciones remotas" — ventana de 7 días + acumulado histórico. */
  async getSummary(now: Date, windowDays = WINDOW_DAYS): Promise<RemoteActionSummary> {
    const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
    const [{ count: totalAllTime }] = await this.db(BATCHES).count("* as count");
    const rows = await this.db(BATCHES).where("created_at", ">=", since).select("status").count("* as count").groupBy("status");
    return summarizeStatusCounts(this.countsByStatus(rows as any[]), Number(totalAllTime), windowDays);
  }

  /** Resultado por tipo de acción — genérico sobre los tipos con datos en la
   * ventana (5 tipos reales; sólo los que tengan algún lote entran acá). */
  async getByTypeBreakdown(now: Date, windowDays = WINDOW_DAYS): Promise<RemoteActionTypeBreakdown[]> {
    const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
    const rows = await this.db(BATCHES).where("created_at", ">=", since)
      .select("action", "status").count("* as count").groupBy("action", "status");
    const byAction = new Map<string, { status: string; count: string | number }[]>();
    for (const r of rows as any[]) {
      const list = byAction.get(r.action) ?? [];
      list.push({ status: r.status, count: r.count });
      byAction.set(r.action, list);
    }
    return [...byAction.entries()].map(([action, list]) => summarizeTypeBreakdown(action as RemoteAction, this.countsByStatus(list)));
  }

  async findById(id: string): Promise<RemoteActionBatch | null> {
    const row = await this.db(BATCHES).where({ id }).first();
    return row ? toEntity(row) : null;
  }

  async itemsOf(batchId: string): Promise<(BatchItemState & { id: string })[]> {
    const rows = await this.db(ITEMS)
      .leftJoin("agents", "agents.id", `${ITEMS}.agent_id`)
      .leftJoin("agent_commands", "agent_commands.id", `${ITEMS}.command_id`)
      .leftJoin("devices", "devices.id", `${ITEMS}.device_id`)
      .where(`${ITEMS}.batch_id`, batchId)
      .select(
        `${ITEMS}.id`, `${ITEMS}.agent_id`, "agents.name as agent_name",
        `${ITEMS}.device_id`, `${ITEMS}.device_ip`, "devices.name_reported as device_label",
        `${ITEMS}.command_id`, "agent_commands.status as command_status"
      );
    return rows.map((r: any) => ({
      id: r.id, agentId: r.agent_id, agentName: r.agent_name,
      deviceId: r.device_id, deviceIp: r.device_ip, deviceLabel: r.device_label,
      commandId: r.command_id, commandStatus: r.command_status,
    }));
  }

  async listDue(now: Date): Promise<RemoteActionBatch[]> {
    const rows = await this.db(BATCHES).where("status", "scheduled").where("scheduled_at", "<=", now);
    return rows.map(toEntity);
  }

  async listSent(): Promise<RemoteActionBatch[]> {
    const rows = await this.db(BATCHES).where("status", "sent");
    return rows.map(toEntity);
  }

  /** `itemId` es el `id` surrogate del item (no agentId: un agente puede
   *  tener más de un item en el mismo lote desde que RESTART_PRINTER
   *  targetea equipos). */
  async setItemCommand(itemId: string, commandId: string): Promise<void> {
    await this.db(ITEMS).where({ id: itemId }).update({ command_id: commandId });
  }

  async setStatus(id: string, status: BatchStatus, completedAt: Date | null): Promise<void> {
    await this.db(BATCHES).where({ id }).update({ status, completed_at: completedAt });
  }

  /** Cancela solo si sigue programado (el despacho no se puede deshacer). */
  async cancelIfScheduled(id: string): Promise<boolean> {
    const count = await this.db(BATCHES).where({ id, status: "scheduled" }).update({ status: "cancelled" });
    return count > 0;
  }
}
