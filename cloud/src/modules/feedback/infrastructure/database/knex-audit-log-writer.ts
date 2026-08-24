import type { Knex } from "knex";
import type { AuditLogEntry, AuditLogWriter } from "../../application/ports/audit-log-writer";

export class KnexAuditLogWriter implements AuditLogWriter {
  constructor(private readonly db: Knex) {}

  async write(entry: AuditLogEntry): Promise<void> {
    await this.db("audit_logs").insert({
      id: this.db.raw("gen_random_uuid()"),
      user_id: entry.userId,
      action: entry.action,
      target_id: entry.targetId,
      metadata: this.db.raw("?::jsonb", [JSON.stringify(entry.metadata)]),
      ip_address: entry.ipAddress,
    });
  }
}
