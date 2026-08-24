import type { Knex } from "knex";
import { writeAudit } from "../../../../services/auditService";
import type { AuditLogWriter, DeviceAuditEntry } from "../../application/ports/audit-log-writer";

/** Adapter sobre `services/auditService.writeAudit` (infra transversal, no se migra). */
export class KnexAuditLogWriter implements AuditLogWriter {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  write(entry: DeviceAuditEntry): Promise<void> {
    return writeAudit(this.db, {
      action: entry.action, targetId: entry.targetId, clientId: entry.clientId,
      userId: entry.userId, ip: entry.ipAddress, metadata: entry.metadata,
    });
  }
}
