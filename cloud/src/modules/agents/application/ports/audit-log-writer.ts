export interface AgentAuditEntry {
  action: string;
  targetId: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  metadata: Record<string, unknown>;
}

/** Puerto de escritura a `audit_logs` — mismo criterio que el resto de los módulos. */
export interface AuditLogWriter {
  write(entry: AgentAuditEntry): Promise<void>;
}
