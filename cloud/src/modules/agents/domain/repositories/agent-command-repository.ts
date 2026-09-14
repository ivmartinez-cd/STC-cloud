import type { AgentCommandRow } from "../entities/agent";

/** Cola de comandos remotos (FORCE_SCAN, RESTART, UPDATE_CONFIG, EWS_PROXY, ...) para agentes DCA. */
export interface AgentCommandRepository {
  insertPending(agentId: string, type: string, payload: Record<string, unknown>, createdBy: string | null): Promise<AgentCommandRow & Record<string, unknown>>;
  /** Devuelve los `pending` y los marca `sent` en el mismo paso, para que no se repitan. */
  takePending(agentId: string): Promise<AgentCommandRow[]>;
  /** Acotado al agente dueño: un agente sólo puede cerrar SUS comandos (antes bastaba conocer el id, auditoría 14/09/2026). */
  setResult(commandId: string, agentId: string, status: string, result: Record<string, unknown> | null): Promise<void>;
}
