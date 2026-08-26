import type { MaskedCredential } from "../../../../services/snmpCredentials";
import { logger } from "../../../../logger";
import type { AgentScope } from "../../domain/entities/agent";
import type { AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";
import { parseIpRangeSpecs, resolveBusinessHours } from "../../domain/services/agent-config-view";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { Actor } from "../dtos/agent-dtos";

export class AgentNotFoundError extends Error {
  readonly statusCode = 404;
}

export class AgentDeleteConflictError extends Error {
  readonly statusCode = 409;
}

export class ListAgentsUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  execute(scope: AgentScope) {
    return this.repo.list(scope);
  }
}

/**
 * Ficha del agente. Para admin/operator agrega `activation_key` y un bloque
 * `config` con el spec crudo de `ip_ranges`, la vista ENMASCARADA de
 * credenciales (nunca los secretos) y `business_hours` resuelto al default.
 */
export class GetAgentDetailUseCase {
  constructor(
    private readonly repo: AgentPortalRepository,
    private readonly maskedCredentials: (agentId: string) => Promise<{ credentials: MaskedCredential[]; rev: number } | null>
  ) {}

  async execute(id: string, scope: AgentScope): Promise<Record<string, unknown>> {
    const full = scope.kind === "all";
    const agent = await this.repo.getDetail(id, full);
    if (!agent) throw new AgentNotFoundError("Monitor no encontrado");
    if (!full) return agent;
    const masked = await this.maskedCredentials(id);
    return {
      ...agent,
      config: {
        ip_ranges: safeParseIpRanges(agent),
        snmp_community: agent.snmp_community,
        scan_interval_minutes: agent.scan_interval_minutes,
        toner_warning_threshold: agent.toner_warning_threshold,
        toner_critical_threshold: agent.toner_critical_threshold,
        snmp_credentials: masked?.credentials ?? [],
        snmp_credentials_rev: masked?.rev ?? 0,
        business_hours: safeBusinessHours(agent),
      },
    };
  }
}

function safeParseIpRanges(agent: Record<string, unknown>): unknown[] {
  try { return parseIpRangeSpecs(agent.ip_ranges); } catch (e) { logger.error({ err: e }, "Error parsing ip_ranges in getAgent"); return []; }
}

function safeBusinessHours(agent: Record<string, unknown>) {
  try { return resolveBusinessHours(agent.business_hours); } catch (e) { logger.error({ err: e }, "Error parsing business_hours in getAgent"); return resolveBusinessHours(null); }
}

export class GetAgentDevicesUseCase {
  constructor(private readonly repo: AgentPortalRepository) {}
  execute(agentId: string, include?: string) {
    return this.repo.listDevices(agentId, include === "decommissioned" || include === "all");
  }
}

export interface AgentUnitOfWork {
  run<T>(fn: (tx: { portal: AgentPortalRepository; audit: AuditLogWriter }) => Promise<T>): Promise<T>;
}

/**
 * Borrado en cascada explícita (lecturas + equipos + agente) en una
 * transacción. Bloqueado (409) si algún equipo tiene historial de
 * facturación: mientras `devices.agent_id` sea ON DELETE CASCADE, borrar un
 * agente es una puerta trasera del ciclo de vida.
 */
export class DeleteAgentUseCase {
  constructor(private readonly unitOfWork: AgentUnitOfWork) {}

  execute(id: string, actor: Actor): Promise<void> {
    return this.unitOfWork.run(async (tx) => {
      const agent = await tx.portal.snapshotForDelete(id);
      const deviceIds = await tx.portal.deviceIdsOf(id);
      if (deviceIds.length > 0 && (await tx.portal.anyClosureLines(deviceIds))) {
        throw new AgentDeleteConflictError("Hay equipos con historial de facturación; movelos a otro monitor o dalos de baja antes de eliminar este agente");
      }
      await tx.portal.deleteCascade(id, deviceIds);
      await tx.audit.write({
        action: "AGENT_DELETED", targetId: id, clientId: agent?.client_id ?? null,
        userId: actor.userId, ipAddress: actor.ipAddress,
        metadata: { name: agent?.name ?? null, client_id: agent?.client_id ?? null, devices_removed: deviceIds.length },
      });
    });
  }
}
