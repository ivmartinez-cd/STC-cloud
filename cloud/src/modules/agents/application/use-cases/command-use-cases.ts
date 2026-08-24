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

  updateResult(commandId: string, status: string, result: Record<string, unknown> | null): Promise<void> {
    return this.commands.setResult(commandId, status, result);
  }
}
