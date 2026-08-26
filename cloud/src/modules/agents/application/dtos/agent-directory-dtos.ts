import type { AgentScope } from "../../domain/entities/agent";

/** Query string cruda de `GET /agents/directory` (handoff hifi "Salud de
 * nodos", 25/08/2026) — mismo criterio "tolerante" que `ListAgentDeviceDirectoryInput`. */
export interface ListAgentDirectoryInput {
  scope: AgentScope;
  q?: string;
  segment?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}
