export interface ReportAuditEntry {
  action: string;
  targetId: string | null;
  userId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
}

/** Puerto de escritura a `audit_logs` — mismo criterio que `modules/alerts` y `modules/feedback`. */
export interface AuditLogWriter {
  write(entry: ReportAuditEntry): Promise<void>;
}
