import type { Knex } from "knex";
import type { DeviceRow, PendingDeviceRow } from "../../domain/entities/device";
import type { DeviceRegistrationRepository, PendingQuery, RegistrationRow } from "../../domain/repositories/device-registration-repository";

export class KnexDeviceRegistrationRepository implements DeviceRegistrationRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  /** Sólo equipos VIVOS — un pendiente dado de baja antes de ser revisado no debe seguir apareciendo en la cola. */
  private pendingQuery(params: PendingQuery) {
    return this.db("devices")
      .leftJoin("agents", "agents.id", "devices.agent_id")
      .where("devices.client_id", params.clientId)
      .where("devices.registration_state", "pending")
      .whereNull("devices.decommissioned_at")
      .whereNull("devices.merged_into")
      .modify((q) => { if (params.agentId) q.andWhere("devices.agent_id", params.agentId); })
      .modify((q) => {
        if (params.q) {
          q.andWhere((b) => {
            b.whereRaw("devices.serial_number ILIKE ?", [`%${params.q}%`])
              .orWhereRaw("devices.ip_address::text ILIKE ?", [`%${params.q}%`])
              .orWhereRaw("devices.hostname ILIKE ?", [`%${params.q}%`])
              .orWhereRaw("devices.model ILIKE ?", [`%${params.q}%`]);
          });
        }
      });
  }

  async listPending(params: PendingQuery): Promise<{ items: PendingDeviceRow[]; total: number }> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = Math.max(params.offset ?? 0, 0);
    const [items, [{ count }]] = await Promise.all([
      this.pendingQuery(params)
        .select(
          "devices.id", "devices.ip_address", "devices.mac", "devices.serial_number", "devices.hostname",
          "devices.name", "devices.brand", "devices.model", "devices.agent_id", "agents.name as agent_name",
          "devices.created_at", "devices.last_seen"
        )
        .orderBy("devices.created_at", "desc").limit(limit).offset(offset),
      this.pendingQuery(params).count("devices.id as count"),
    ]);
    return { items, total: Number(count) };
  }

  findRegistrationRows(ids: string[]): Promise<RegistrationRow[]> {
    return this.db("devices").whereIn("id", ids).select("id", "client_id", "registration_state");
  }

  async markRegistered(ids: string[], by: string | null): Promise<void> {
    await this.db("devices").whereIn("id", ids).update({ registration_state: "registered", registered_at: new Date(), registered_by: by });
  }

  async markIgnored(ids: string[], by: string | null, reason: string): Promise<void> {
    await this.db("devices").whereIn("id", ids).update({ registration_state: "ignored", ignored_at: new Date(), ignored_by: by, ignore_reason: reason });
  }

  async findById(id: string): Promise<DeviceRow | null> {
    return (await this.db("devices").where({ id }).first()) ?? null;
  }

  async unignore(id: string): Promise<DeviceRow> {
    const [row] = await this.db("devices").where({ id })
      .update({ registration_state: "pending", ignored_at: null, ignored_by: null, ignore_reason: null }).returning("*");
    return row;
  }
}
