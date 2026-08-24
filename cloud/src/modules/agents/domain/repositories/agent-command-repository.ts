import type { AgentCommandRow } from "../entities/agent";

/** Cola de comandos remotos (FORCE_SCAN, RESTART, UPDATE_CONFIG, EWS_PROXY, ...) para agentes DCA. */
export interface AgentCommandRepository {
  insertPending(agentId: string, type: string, payload: Record<string, unknown>, createdBy: string | null): Promise<AgentCommandRow & Record<string, unknown>>;
  /** Devuelve los `pending` y los marca `sent` en el mismo paso, para que no se repitan. */
  takePending(agentId: string): Promise<AgentCommandRow[]>;
  setResult(commandId: string, status: string, result: Record<string, unknown> | null): Promise<void>;
}
