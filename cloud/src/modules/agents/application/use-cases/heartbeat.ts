import type { SystemInfoPayload } from "../../domain/entities/agent";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import type { AuditLogWriter } from "../ports/audit-log-writer";

/**
 * Latido del agente: `last_seen` + info de sistema del host; un `offline`
 * vuelve a `active`. Fase 6 (R5) del gap analysis vs HP SDS señalaba el
 * cambio de versión de agente como hallazgo menor sin auditar — se lee la
 * versión ANTES de sobreescribirla y sólo se audita si de verdad cambió
 * (nunca en el primer latido, donde no hay versión previa con la cual
 * comparar): auditar cada latido sería puro ruido, la versión no cambia
 * seguido.
 */
export class HeartbeatUseCase {
  constructor(private readonly agents: AgentRepository, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, systemInfo?: SystemInfoPayload, ipAddress?: string): Promise<void> {
    if (!agentId) return;

    if (systemInfo?.version) {
      const previousVersion = await this.agents.getVersion(agentId);
      if (previousVersion && previousVersion !== systemInfo.version) {
        const agent = await this.agents.findById(agentId);
        await this.audit.write({
          action: "AGENT_VERSION_CHANGED", targetId: agentId, clientId: agent?.client_id ?? null, userId: null, ipAddress,
          metadata: { from: previousVersion, to: systemInfo.version },
        });
      }
    }

    await this.agents.heartbeat(agentId, systemInfo);
  }
}
