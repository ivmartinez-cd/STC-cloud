import type { AgentCommandRow } from "../../domain/entities/agent";
import type { AgentCommandRepository } from "../../domain/repositories/agent-command-repository";

/** Cola de comandos remotos — movida de `AgentCommandService`. */
export class AgentCommandsUseCase {
  constructor(private readonly commands: AgentCommandRepository) {}

  /** Registra un comando pendiente; el caller decide si además lo empuja por WSS. */
  add(agentId: string, type: string, payload: Record<string, unknown> = {}, createdBy?: string) {
    return this.commands.insertPending(agentId, type, payload, createdBy || null);
  }

  /** Pendientes → `sent` en el mismo paso (nunca se repiten). */
  takePending(agentId: string): Promise<AgentCommandRow[]> {
    return this.commands.takePending(agentId);
  }

  /**
   * `status` se normaliza a `completed`/`error`: antes se guardaba lo que
   * mandara el agente, y un `"pending"` hacía que el comando se volviera a
   * entregar en el próximo latido (replay).
   */
  updateResult(commandId: string, agentId: string, status: string, result: Record<string, unknown> | null): Promise<void> {
    const normalized = status === "error" ? "error" : "completed";
    return this.commands.setResult(commandId, agentId, normalized, result);
  }
}
