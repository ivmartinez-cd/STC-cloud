import type { AgentScope } from "../entities/agent";
import type {
  AgentDirectoryFilters, AgentDirectoryResponse, AgentFleetSummary, AgentSignalBucketsResponse,
} from "../entities/agent-directory";

/** Lecturas de "Salud de nodos" (handoff hifi, 25/08/2026) — separado de
 * `AgentPortalRepository` a propósito, ver docblock de
 * `KnexAgentDirectoryRepository` (el repo existente ya está en el techo del
 * ratchet de `check:sizes`). */
export interface AgentDirectoryRepository {
  listDirectory(filters: AgentDirectoryFilters): Promise<AgentDirectoryResponse>;
  getFleetSummary(scope: AgentScope, publishedVersion: string): Promise<AgentFleetSummary>;
  getSignalBuckets(scope: AgentScope): Promise<AgentSignalBucketsResponse>;
}
