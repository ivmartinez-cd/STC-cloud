import type { Knex } from "knex";
import { writeAudit } from "../../../../services/auditService";
import type { AuditLogWriter, ClientAuditEntry } from "../../application/ports/audit-log-writer";

/** Adapter sobre `services/auditService.writeAudit` (infra transversal, no se migra). */
export class KnexAuditLogWriter implements AuditLogWriter {
  constructor(private readonly db: Knex) {}

  write(entry: ClientAuditEntry): Promise<void> {
    return writeAudit(this.db, {
      action: entry.action, targetId: entry.targetId, userId: entry.userId, ip: entry.ipAddress, metadata: entry.metadata,
    });
  }
}
