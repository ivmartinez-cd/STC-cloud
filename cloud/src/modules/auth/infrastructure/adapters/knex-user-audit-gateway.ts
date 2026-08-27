import type { Knex } from "knex";
import type { UserAuditPort } from "../../application/ports/user-audit-port";

export class KnexUserAuditGateway implements UserAuditPort {
  constructor(private readonly db: Knex, private readonly ip: string) {}

  async recordCreated(actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.insert("USER_CREATED", actorId, targetId, metadata);
  }

  async recordUpdated(actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.insert("USER_UPDATED", actorId, targetId, metadata);
  }

  async recordDeleted(actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.insert("USER_DELETED", actorId, targetId, metadata);
  }

  private async insert(action: string, actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db("audit_logs").insert({
      action,
      target_id: targetId,
      user_id: actorId,
      ip_address: this.ip,
      metadata: JSON.stringify(metadata),
    });
  }
}
