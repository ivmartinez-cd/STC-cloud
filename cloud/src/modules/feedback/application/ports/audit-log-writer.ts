export interface AuditLogEntry {
  userId: string;
  // Cliente del autor: lo exige `audit_logs.client_id` para que el feed pueda
  // filtrar por cliente (ARCHITECTURE_GUIDE §8.8).
  clientId: string | null;
  action: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
}

export interface AuditLogWriter {
  write(entry: AuditLogEntry): Promise<void>;
}
