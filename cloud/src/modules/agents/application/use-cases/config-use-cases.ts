import type { IpRangeSpecInput } from "../../../../shared/domain/ip-range-spec";
import { legacyCommunity } from "../../../../services/snmpCredentials";
import {
  auditMetadata, buildStored, maskCredentials, toWire, validateCredentials, type MaskedCredential,
} from "../../../../services/snmpCredentials";
import { logger } from "../../../../logger";
import type { AgentConfigUpdate, AuditContext } from "../../domain/entities/agent";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import {
  buildConfigUpdates, buildDevicePolicies, buildHeartbeatRanges, parseIpRangeSpecs, parseStoredCredentials,
  resolveBusinessHours,
} from "../../domain/services/agent-config-view";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { ReplaceSnmpCredentialsResult, UpdateConfigResult } from "../dtos/agent-dtos";

/** Configuración de red/escaneo, ip_ranges y credenciales SNMP — movidos de `AgentConfigService`. */

export class UpdateAgentConfigUseCase {
  constructor(private readonly agents: AgentRepository, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, newConfig: AgentConfigUpdate, audit?: AuditContext): Promise<UpdateConfigResult> {
    const { updates, warnings } = buildConfigUpdates(newConfig);
    if (Object.keys(updates).length > 0) await this.agents.updateColumns(agentId, updates);
    const agent = await this.agents.findById(agentId);
    // Redactado: sólo los nombres de campo tocados, nunca `snmp_community` en claro.
    await this.audit.write({
      action: "UPDATE_CONFIG", targetId: agentId, clientId: agent?.client_id ?? null,
      userId: audit?.userId ?? null, ipAddress: audit?.ip ?? null,
      metadata: { fields: Object.keys(updates) },
    });
    return { status: "success", warnings };
  }
}

/**
 * Config que alimenta el HEARTBEAT del agente: `ip_ranges` COMPILADO a pares
 * planos, `ip_hosts`, `business_hours` resuelto al default, `snmp_community`
 * legacy, `snmp_credentials` descifradas (NUNCA para el portal — ver
 * `GetSnmpCredentialsMaskedUseCase`) y `device_policies`. El heartbeat nunca
 * puede fallar por el descifrado: si revienta se omite el campo.
 */
export class GetAgentHeartbeatConfigUseCase {
  constructor(private readonly agents: AgentRepository) {}

  async execute(agentId: string): Promise<Record<string, any> | null> {
    const row = await this.agents.getConfigRow(agentId);
    if (!row) return null;
    const rawSpecs = parseIpRangeSpecs(row.ip_ranges);
    const stored = parseStoredCredentials(row.snmp_credentials);
    const { ip_ranges, ip_hosts } = buildHeartbeatRanges(rawSpecs, new Set(stored.map((c) => c.id)));

    const config: Record<string, any> = {
      ip_ranges,
      snmp_community: legacyCommunity(stored, row.snmp_community ?? null),
      scan_interval_minutes: row.scan_interval_minutes,
      toner_warning_threshold: row.toner_warning_threshold,
      toner_critical_threshold: row.toner_critical_threshold,
      business_hours: resolveBusinessHours(row.business_hours),
    };
    if (ip_hosts.length > 0) config.ip_hosts = ip_hosts;
    try {
      const wire = toWire(stored);
      if (wire.length > 0) config.snmp_credentials = wire;
    } catch (err) {
      logger.error({ err }, `[AGENT_SERVICE] No se pudo armar snmp_credentials para el heartbeat de ${agentId}`);
    }
    const policies = buildDevicePolicies(await this.agents.devicePolicies(agentId));
    if (policies.length > 0) config.device_policies = policies;
    return config;
  }
}

/** Specs de `ip_ranges` SIN compilar — lo que el admin escribió, para el portal. */
export class GetIpRangeSpecsRawUseCase {
  constructor(private readonly agents: AgentRepository) {}
  async execute(agentId: string): Promise<IpRangeSpecInput[] | null> {
    const raw = await this.agents.getIpRangesRaw(agentId);
    if (raw === undefined) return null;
    return parseIpRangeSpecs(raw);
  }
}

/** Vista enmascarada para el portal — nunca material de clave. `rev` para optimistic locking. */
export class GetSnmpCredentialsMaskedUseCase {
  constructor(private readonly agents: AgentRepository) {}
  async execute(agentId: string): Promise<{ credentials: MaskedCredential[]; rev: number } | null> {
    const row = await this.agents.getSnmpCredentialsRow(agentId);
    if (!row) return null;
    return { credentials: maskCredentials(parseStoredCredentials(row.snmp_credentials)), rev: row.snmp_credentials_rev ?? 0 };
  }
}

/** Reemplaza TODA la lista; `expected_rev` evita que dos pestañas se pisen (conflict). */
export class ReplaceSnmpCredentialsUseCase {
  constructor(private readonly agents: AgentRepository, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, body: unknown, audit?: AuditContext): Promise<ReplaceSnmpCredentialsResult> {
    const bodyObj = (body ?? {}) as { expected_rev?: unknown; credentials?: unknown };
    const current = await this.agents.getSnmpCredentialsRow(agentId);
    if (!current) return null;
    const currentRev = current.snmp_credentials_rev ?? 0;
    if (typeof bodyObj.expected_rev === "number" && bodyObj.expected_rev !== currentRev) return { status: "conflict", rev: currentRev };

    const currentStored = parseStoredCredentials(current.snmp_credentials);
    const nextStored = buildStored(validateCredentials(bodyObj.credentials), currentStored);
    const nextRev = currentRev + 1;
    await this.agents.replaceSnmpCredentials(agentId, JSON.stringify(nextStored), nextRev);
    const agent = await this.agents.findById(agentId);
    await this.audit.write({
      action: "AGENT_SNMP_CREDENTIALS_UPDATED", targetId: agentId, clientId: agent?.client_id ?? null,
      userId: audit?.userId ?? null, ipAddress: audit?.ip ?? null,
      metadata: auditMetadata(nextStored) as Record<string, unknown>,
    });
    return { status: "success", count: nextStored.length, rev: nextRev, warnings: removedCredentialWarnings(currentStored, nextStored, current.ip_ranges) };
  }
}

// Warning no bloqueante: un rango que referencia una credencial recién borrada
// cae al fail-open (pool completo) en el próximo heartbeat.
function removedCredentialWarnings(current: Array<{ id: string }>, next: Array<{ id: string }>, ipRanges: unknown): string[] {
  const nextIds = new Set(next.map((c) => c.id));
  const removed = new Set(current.map((c) => c.id).filter((id) => !nextIds.has(id)));
  if (removed.size === 0) return [];
  const affected = parseIpRangeSpecs(ipRanges).filter((s) => s.credential_ids?.some((id) => removed.has(id)));
  return affected.length > 0
    ? [`${affected.length} rango(s) de ip_ranges referencian una credencial que se acaba de eliminar — probarán el pool completo de credenciales en el próximo ciclo.`]
    : [];
}
