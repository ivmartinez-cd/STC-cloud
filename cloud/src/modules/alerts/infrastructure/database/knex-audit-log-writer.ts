import type { Knex } from "knex";
import { writeAudit } from "../../../../services/auditService";
import type { AlertAuditEntry, AuditLogWriter } from "../../application/ports/audit-log-writer";

/**
 * Adapter del puerto sobre `services/auditService.writeAudit` — el punto único
 * de escritura a `audit_logs` (infraestructura transversal, deliberadamente no
 * migrada a ningún módulo; ver decisión en la pasada de `audit`).
 */
export class KnexAuditLogWriter implements AuditLogWriter {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  write(entry: AlertAuditEntry): Promise<void> {
    return writeAudit(this.db, {
      action: entry.action,
      targetId: entry.targetId,
      userId: entry.userId,
      ip: entry.ipAddress,
      metadata: entry.metadata,
    });
  }
}
