import type { AgentService } from "../../../agents";

export class GlobalSearchUseCase {
  constructor(private readonly agentService: AgentService) {}

  async execute(q: string | undefined, cid: string | null) {
    if (!q || q.length < 2) return { clients: [], devices: [] };
    return this.agentService.globalSearch(q, cid);
  }
}
