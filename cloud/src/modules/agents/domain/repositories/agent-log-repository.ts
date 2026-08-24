import type { AgentLogRow } from "../services/agent-logs";

export interface AgentLogRepository {
  insertMany(rows: AgentLogRow[]): Promise<void>;
  /** Más recientes primero. */
  listRecent(agentId: string, limit: number): Promise<Array<{ timestamp?: string; level?: string; message: string }>>;
}
