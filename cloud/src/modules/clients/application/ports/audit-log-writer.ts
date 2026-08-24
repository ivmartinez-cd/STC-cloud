export interface ClientAuditEntry {
  action: string;
  targetId: string | null;
  userId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
}

/** Puerto de escritura a `audit_logs` — mismo criterio que `modules/alerts`/`modules/reports`. */
export interface AuditLogWriter {
  write(entry: ClientAuditEntry): Promise<void>;
}
