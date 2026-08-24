import type { SystemInfoPayload } from "../../domain/entities/agent";
import type { AgentRepository } from "../../domain/repositories/agent-repository";

/** Latido del agente: `last_seen` + info de sistema del host; un `offline` vuelve a `active`. */
export class HeartbeatUseCase {
  constructor(private readonly agents: AgentRepository) {}

  async execute(agentId: string, systemInfo?: SystemInfoPayload): Promise<void> {
    if (!agentId) return;
    await this.agents.heartbeat(agentId, systemInfo);
  }
}
