import type { AgentLogRow } from "../services/agent-logs";

export interface AgentLogRepository {
  insertMany(rows: AgentLogRow[]): Promise<void>;
  /** Más recientes primero. */
  listRecent(agentId: string, limit: number): Promise<Array<{ timestamp?: string; level?: string; message: string }>>;
  /** `business_hours.timezone` del agente — para mostrar el reporte exportado en su propia TZ, no una fija. `null` si el agente no existe o no tiene TZ configurada. */
  findTimezone(agentId: string): Promise<string | null>;
}
