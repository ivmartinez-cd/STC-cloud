import type { Knex } from "knex";
import type {
  BatchItemState,
  BatchStatus,
  RemoteAction,
  RemoteActionBatch,
} from "../../domain/entities/remote-action-batch";

const BATCHES = "remote_action_batches";
const ITEMS = "remote_action_items";

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

  async list(limit: number, offset: number): Promise<{ items: (RemoteActionBatch & { total_items: number })[]; total: number }> {
    const [{ count }] = await this.db(BATCHES).count("* as count");
    const rows = await this.db(BATCHES)
      .select(`${BATCHES}.*`, this.db(ITEMS).count("*").whereRaw(`${ITEMS}.batch_id = ${BATCHES}.id`).as("total_items"))
      .orderBy("created_at", "desc").limit(Math.min(limit, 200)).offset(offset);
    return { items: rows.map((r: any) => ({ ...toEntity(r), total_items: Number(r.total_items) })), total: Number(count) };
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
