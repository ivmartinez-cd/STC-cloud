import type { Knex } from "knex";
import type { AuditLogEntry, AuditLogWriter } from "../../application/ports/audit-log-writer";
// Punto único de escritura a `audit_logs` (ARCHITECTURE_GUIDE §8.8): garantiza
// que `client_id` se setee siempre, para que el feed pueda filtrar por cliente.
import { writeAudit } from "../../../../services/auditService";

export class KnexAuditLogWriter implements AuditLogWriter {
  constructor(private readonly db: Knex) {}

  async write(entry: AuditLogEntry): Promise<void> {
    await writeAudit(this.db, {
      action: entry.action,
      targetId: entry.targetId,
      clientId: entry.clientId,
      userId: entry.userId,
      ip: entry.ipAddress,
      metadata: entry.metadata,
    });
  }
}
