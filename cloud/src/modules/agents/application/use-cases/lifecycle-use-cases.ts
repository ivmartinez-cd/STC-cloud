import { validateIpRangeSpecs } from "../../../../services/ipRangeSpec";
import { validateBusinessHours } from "../../../../services/businessHours";
import type { AuditContext } from "../../domain/entities/agent";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import { hashToken, isActivationExpired, newActivationKey, newAgentId, newRefreshToken } from "../../domain/services/tokens";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { TokenBlacklist } from "../ports/token-blacklist";
import type { ActivateAgentResult, CreateActivationKeyInput, CreateActivationKeyResult } from "../dtos/agent-dtos";

/** Activación, tokens y revocación de agentes DCA — movidos de `AgentLifecycleService`. */

export class CreateActivationKeyUseCase {
  constructor(private readonly agents: AgentRepository, private readonly audit: AuditLogWriter) {}

  async execute(input: CreateActivationKeyInput): Promise<CreateActivationKeyResult> {
    // Validado acá, no sólo en updateConfig(): sin esto un agente podía nacer
    // con specs inválidos/gigantes desde el alta inicial.
    const config = input.config;
    const validatedRanges = config?.ip_ranges !== undefined ? validateIpRangeSpecs(config.ip_ranges) : null;
    const validatedBusinessHours = config?.business_hours !== undefined ? validateBusinessHours(config.business_hours) : null;
    const { key, expiresAt } = newActivationKey();
    const agentId = newAgentId();

    await this.agents.insertPending({
      id: agentId, clientId: input.clientId, name: input.name, activationKey: key, expiresAt,
      ipRanges: validatedRanges ? JSON.stringify(validatedRanges) : null,
      snmpCommunity: config?.snmp_community ?? "public",
      scanIntervalMinutes: config?.scan_interval_minutes ?? 15,
      businessHours: validatedBusinessHours ? JSON.stringify(validatedBusinessHours) : null,
    });
    await this.audit.write({
      action: "AGENT_CREATED", targetId: agentId, userId: input.audit?.userId ?? null, ipAddress: input.audit?.ip ?? null,
      metadata: { clientId: input.clientId, name: input.name },
    });
    return { agentId, key, expiresAt };
  }
}

export class ActivateAgentUseCase {
  constructor(private readonly agents: AgentRepository, private readonly audit: AuditLogWriter) {}

  async execute(key: string, hardwareId: string): Promise<ActivateAgentResult> {
    const agent = await this.agents.findByActivationKey(key);
    if (!agent) throw new Error("Llave de activación inválida o ya usada");
    if (isActivationExpired(agent.activation_expires_at)) throw new Error("Llave de activación expirada");

    const refresh = newRefreshToken();
    await this.agents.activate(agent.id, hardwareId, refresh.hash);
    await this.audit.write({ action: "AGENT_ACTIVATED", targetId: agent.id, metadata: { hardwareId } });
    return { agentId: agent.id, refreshToken: refresh.token };
  }
}

/** Valida agentId + hash del refresh token y lo rota. */
export class RefreshAgentTokenUseCase {
  constructor(private readonly agents: AgentRepository) {}

  async execute(agentId: string, refreshToken: string): Promise<ActivateAgentResult> {
    const agent = await this.agents.findRefreshable(agentId);
    if (!agent) throw new Error("Agente no encontrado o inactivo");
    if (!agent.refresh_token_hash || agent.refresh_token_hash !== hashToken(refreshToken)) {
      throw new Error("Refresh token inválido");
    }
    const next = newRefreshToken();
    await this.agents.rotateRefreshToken(agentId, next.hash);
    return { agentId, refreshToken: next.token };
  }
}

export class RegenerateActivationKeyUseCase {
  constructor(private readonly agents: AgentRepository, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, audit?: AuditContext): Promise<CreateActivationKeyResult> {
    if (!(await this.agents.findById(agentId))) throw new Error("Agente no encontrado");
    const { key, expiresAt } = newActivationKey();
    await this.agents.resetActivation(agentId, key, expiresAt);
    await this.audit.write({
      action: "REGENERATE_KEY", targetId: agentId, userId: audit?.userId ?? null, ipAddress: audit?.ip ?? null,
      metadata: { reason: "Manual key regeneration from portal" },
    });
    return { agentId, key, expiresAt };
  }
}

/** Revoca el token: blacklist en Redis + `status='revoked'` + audit. */
export class RevokeTokenUseCase {
  constructor(private readonly agents: AgentRepository, private readonly blacklist: TokenBlacklist, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, ttlSeconds: number, requestIp?: string): Promise<void> {
    await this.blacklist.add(agentId, ttlSeconds);
    await this.agents.setStatus(agentId, "revoked");
    await this.audit.write({ action: "REVOKE_TOKEN", targetId: agentId, ipAddress: requestIp || null, metadata: { reason: "Manual revocation from portal" } });
  }
}
