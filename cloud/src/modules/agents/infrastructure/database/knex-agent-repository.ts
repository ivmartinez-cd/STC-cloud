import type { Knex } from "knex";
import type { AgentRow, SystemInfoPayload } from "../../domain/entities/agent";
import type { AgentRepository, NewPendingAgent, SnmpCredentialsRow } from "../../domain/repositories/agent-repository";
import type { AgentConfigRow, DevicePolicyRow } from "../../domain/services/agent-config-view";
import { isAgentDiscoveryState } from "../../domain/services/discovery-state";

export class KnexAgentRepository implements AgentRepository {
  constructor(private readonly db: Knex) {}

  async findById(id: string): Promise<AgentRow | null> {
    return (await this.db("agents").where({ id }).first()) ?? null;
  }

  async findByActivationKey(key: string): Promise<AgentRow | null> {
    return (await this.db("agents").where({ activation_key: key }).whereIn("status", ["pending", "offline"]).first()) ?? null;
  }

  async findRefreshable(id: string): Promise<AgentRow | null> {
    return (await this.db("agents").where({ id }).whereIn("status", ["active", "offline"]).first()) ?? null;
  }

  async insertPending(a: NewPendingAgent): Promise<void> {
    await this.db("agents").insert({
      id: a.id, client_id: a.clientId, name: a.name, activation_key: a.activationKey, activation_expires_at: a.expiresAt,
      status: "pending", ip_ranges: a.ipRanges, snmp_community: a.snmpCommunity, scan_interval_minutes: a.scanIntervalMinutes,
      business_hours: a.businessHours,
    });
  }

  async activate(id: string, hardwareId: string, refreshTokenHash: string): Promise<void> {
    await this.db("agents").where({ id }).update({
      status: "active", activation_key: null, activation_expires_at: null, refresh_token_hash: refreshTokenHash,
      hardware_id: hardwareId, last_seen: new Date(),
    });
  }

  async rotateRefreshToken(id: string, refreshTokenHash: string): Promise<void> {
    await this.db("agents").where({ id }).update({ refresh_token_hash: refreshTokenHash, last_seen: new Date(), status: "active" });
  }

  async resetActivation(id: string, activationKey: string, expiresAt: Date): Promise<void> {
    // `discovery_state` se limpia junto con el vínculo: si no, un agente vuelto
    // a "pending" sigue mostrando en el portal la vuelta que tenía abierta la
    // instalación anterior. El próximo heartbeat lo repuebla.
    await this.db("agents").where({ id }).update({
      activation_key: activationKey, activation_expires_at: expiresAt, status: "pending", hardware_id: null, refresh_token_hash: null,
      discovery_state: null,
    });
  }

  async setStatus(id: string, status: string): Promise<void> {
    await this.db("agents").where({ id }).update({ status });
  }

  async updateColumns(id: string, updates: Record<string, unknown>): Promise<void> {
    await this.db("agents").where({ id }).update(updates);
  }

  async getConfigRow(id: string): Promise<AgentConfigRow | null> {
    return (await this.db("agents").where({ id }).select(
      "ip_ranges", "snmp_community", "scan_interval_minutes", "toner_warning_threshold", "toner_critical_threshold", "snmp_credentials", "business_hours"
    ).first()) ?? null;
  }

  async getIpRangesRaw(id: string): Promise<unknown | undefined> {
    const row = await this.db("agents").where({ id }).select("ip_ranges").first();
    return row ? row.ip_ranges : undefined;
  }

  async getSnmpCredentialsRow(id: string): Promise<SnmpCredentialsRow | null> {
    return (await this.db("agents").where({ id }).select("snmp_credentials", "snmp_credentials_rev", "ip_ranges").first()) ?? null;
  }

  async replaceSnmpCredentials(id: string, stored: string, rev: number): Promise<void> {
    await this.db("agents").where({ id }).update({ snmp_credentials: stored, snmp_credentials_rev: rev });
  }

  devicePolicies(agentId: string): Promise<DevicePolicyRow[]> {
    return this.db("devices").where({ agent_id: agentId })
      .where((b) => b.whereNot("monitor_state", "full").orWhere("registration_state", "ignored"))
      .whereNull("merged_into").select("ip_address", "monitor_state", "registration_state").limit(500);
  }

  async clientContext(agentId: string): Promise<{ clientId: string | null; approvalRequired: boolean }> {
    const row = await this.db("agents").leftJoin("clients", "agents.client_id", "clients.id")
      .where("agents.id", agentId).select("agents.client_id", "clients.device_approval_required").first();
    return { clientId: row?.client_id ?? null, approvalRequired: row?.device_approval_required ?? false };
  }

  async getVersion(id: string): Promise<string | null> {
    const row = await this.db("agents").where({ id }).select("version").first();
    return row?.version ?? null;
  }

  async heartbeat(id: string, systemInfo?: SystemInfoPayload): Promise<void> {
    const updateData: Record<string, unknown> = { last_seen: new Date() };
    if (systemInfo) {
      for (const k of ["version", "host_name", "host_os", "host_ip", "uptime", "channel", "runtime"] as const) {
        if (systemInfo[k] !== undefined) updateData[k] = systemInfo[k];
      }
      // jsonb: `JSON.stringify` explícito como el resto (`ip_ranges` y cía).
      // El heartbeat no tiene schema de body, así que se filtra por forma acá
      // o un valor raro envenena la lectura del portal; si no cumple se deja la
      // última foto buena. Se guarda el objeto original, no una copia de los 7
      // campos, para no perder los que agregue un agente más nuevo.
      if (isAgentDiscoveryState(systemInfo.discovery_state)) {
        updateData.discovery_state = JSON.stringify(systemInfo.discovery_state);
      }
    }
    await this.db("agents").where({ id }).update(updateData);
    await this.db("agents").where({ id, status: "offline" }).update({ status: "active" });
  }

  async touchOnSync(id: string): Promise<void> {
    try {
      await this.db("agents").where("id", id).update({ last_seen: new Date(), status: "active" });
    } catch { /* continuar si el agente fue eliminado */ }
  }
}
