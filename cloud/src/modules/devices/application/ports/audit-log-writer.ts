export interface DeviceAuditEntry {
  action: string;
  targetId: string | null;
  clientId: string | null;
  userId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
}

/** Puerto de escritura a `audit_logs` — con `clientId` (el feed de "Movimientos y cambios" filtra por cliente). */
export interface AuditLogWriter {
  write(entry: DeviceAuditEntry): Promise<void>;
}
