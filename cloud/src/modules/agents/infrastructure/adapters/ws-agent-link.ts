import { broadcastToPortal, sendCommandToAgent } from "../../../../ws/index";
import type { AgentLink } from "../../application/ports/agent-link";

/** Adapter sobre `ws/index.ts` (WSS de agentes y portales). */
export class WsAgentLink implements AgentLink {
  pushCommand(agentId: string, type: string, payload: Record<string, unknown> = {}, commandId?: string): boolean {
    return sendCommandToAgent(agentId, type, payload, commandId);
  }

  broadcastToPortal(event: string, data: unknown): void {
    broadcastToPortal(event, data);
  }
}
