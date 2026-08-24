export interface AlertAuditEntry {
  action: string;
  targetId: string | null;
  userId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Puerto de escritura a `audit_logs`. Mismo criterio que `modules/feedback`:
 * cada módulo define su propio puerto en vez de depender de un "dueño"
 * central de la tabla (ver decisión en la pasada de `audit`).
 */
export interface AuditLogWriter {
  write(entry: AlertAuditEntry): Promise<void>;
}
