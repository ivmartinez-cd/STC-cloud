import type { Knex } from "knex";
import { writeAudit } from "../../../../services/auditService";
import type { AgentAuditEntry, AuditLogWriter } from "../../application/ports/audit-log-writer";

/** Adapter sobre `services/auditService.writeAudit` (infra transversal, no se migra). */
export class KnexAuditLogWriter implements AuditLogWriter {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  write(entry: AgentAuditEntry): Promise<void> {
    return writeAudit(this.db, {
      action: entry.action, targetId: entry.targetId, clientId: entry.clientId ?? null,
      userId: entry.userId ?? null, ip: entry.ipAddress ?? null, metadata: entry.metadata,
    });
  }
}
