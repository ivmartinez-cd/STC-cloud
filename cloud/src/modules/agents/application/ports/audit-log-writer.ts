export interface AgentAuditEntry {
  action: string;
  targetId: string | null;
  /** `client_id` del agente afectado, cuando se conoce en el momento del
   * write — sin esto, el feed de "Movimientos" (`/audit-logs`) no puede
   * scopear estas filas por cliente y las muestra como "Sin cliente" aunque
   * el agente sí pertenezca a uno. */
  clientId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  metadata: Record<string, unknown>;
}

/** Puerto de escritura a `audit_logs` — mismo criterio que el resto de los módulos. */
export interface AuditLogWriter {
  write(entry: AgentAuditEntry): Promise<void>;
}
