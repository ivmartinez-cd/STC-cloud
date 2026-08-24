export interface AuditLogEntry {
  userId: string;
  action: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
}

export interface AuditLogWriter {
  write(entry: AuditLogEntry): Promise<void>;
}
