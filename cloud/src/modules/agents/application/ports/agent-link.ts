/**
 * Enlace en vivo con agentes y portales (WebSocket, `ws/index.ts`). El
 * comando también queda persistido en `agent_commands`: si el agente no está
 * conectado lo levanta en el próximo heartbeat.
 */
export interface AgentLink {
  /** `true` si se empujó por WSS al instante. */
  pushCommand(agentId: string, type: string, payload?: Record<string, unknown>, commandId?: string): boolean;
  broadcastToPortal(event: string, data: unknown): void;
}
