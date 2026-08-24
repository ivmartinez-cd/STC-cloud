import type { Knex } from "knex";
import crypto from "crypto";
import { validateIpRangeSpecs } from "../ipRangeSpec";
import { validateBusinessHours } from "../businessHours";
import { hashToken } from "./reading-helpers";
import type { AgentConfigUpdate, AuditContext, RedisClient } from "./types";

/** Activación, tokens y revocación de agentes DCA. */
export class AgentLifecycleService {
  constructor(private db: Knex) {}

  /**
   * Genera una llave de activación criptográfica de un solo uso para un nuevo agente.
   * La llave expira en 24 horas y se vincula al cliente especificado.
   * @param clientId - UUID del cliente corporativo propietario del agente.
   * @param name - Nombre descriptivo del monitor (ej: "Sucursal Centro").
   * @param config - Configuración inicial de red opcional (rangos IP, comunidad SNMP).
   * @returns Objeto con el agentId generado, la llave de activación y la fecha de expiración.
   */
  async createActivationKey(
    clientId: string,
    name: string,
    config?: Pick<AgentConfigUpdate, 'ip_ranges' | 'snmp_community' | 'scan_interval_minutes' | 'business_hours'>,
    audit?: AuditContext
  ) {
    // Validado acá, no sólo en updateConfig() — sin esto un agente podía
    // nacer con specs inválidos/gigantes desde el alta inicial (gap que el
    // diseño inicial de esta feature no cubría).
    const validatedRanges = config?.ip_ranges !== undefined ? validateIpRangeSpecs(config.ip_ranges) : null;
    const validatedBusinessHours = config?.business_hours !== undefined ? validateBusinessHours(config.business_hours) : null;

    const key = crypto.randomBytes(32).toString("hex"); // 64 chars hex
    const agentId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db("agents").insert({
      id: agentId,
      client_id: clientId,
      name,
      activation_key: key,
      activation_expires_at: expiresAt,
      status: "pending",
      ip_ranges: validatedRanges ? JSON.stringify(validatedRanges) : null,
      snmp_community: config?.snmp_community ?? "public",
      scan_interval_minutes: config?.scan_interval_minutes ?? 15,
      business_hours: validatedBusinessHours ? JSON.stringify(validatedBusinessHours) : null,
    });

    await this.db("audit_logs").insert({
      action: "AGENT_CREATED",
      target_id: agentId,
      user_id: audit?.userId ?? null,
      ip_address: audit?.ip ?? null,
      metadata: JSON.stringify({ clientId, name }),
    });

    return { agentId, key, expiresAt };
  }

  async activateAgent(key: string, hardwareId: string) {
    const agent = await this.db("agents")
      .where({ activation_key: key })
      .whereIn("status", ["pending", "offline"])
      .first();

    if (!agent) {
      throw new Error("Llave de activación inválida o ya usada");
    }

    // Validar TTL de 24h (bug #1 del análisis — ahora corregido)
    if (agent.activation_expires_at && new Date(agent.activation_expires_at) < new Date()) {
      throw new Error("Llave de activación expirada");
    }

    const refreshToken = crypto.randomBytes(64).toString("hex");
    const refreshTokenHash = hashToken(refreshToken);

    await this.db("agents")
      .where({ id: agent.id })
      .update({
        status: "active",
        activation_key: null,
        activation_expires_at: null,
        refresh_token_hash: refreshTokenHash,
        hardware_id: hardwareId,
        last_seen: new Date(),
      });

    await this.db("audit_logs").insert({
      action: "AGENT_ACTIVATED",
      target_id: agent.id,
      metadata: JSON.stringify({ hardwareId }),
    });

    return { agentId: agent.id, refreshToken };
  }

  // Bug #1 corregido: ahora valida el agentId + hash del refresh_token
  async refreshAgentToken(agentId: string, refreshToken: string) {
    const agent = await this.db("agents")
      .where({ id: agentId })
      .whereIn("status", ["active", "offline"])
      .first();

    if (!agent) {
      throw new Error("Agente no encontrado o inactivo");
    }

    const incomingHash = hashToken(refreshToken);
    if (!agent.refresh_token_hash || agent.refresh_token_hash !== incomingHash) {
      throw new Error("Refresh token inválido");
    }

    const newRefreshToken = crypto.randomBytes(64).toString("hex");
    const newRefreshTokenHash = hashToken(newRefreshToken);

    await this.db("agents")
      .where({ id: agentId })
      .update({
        refresh_token_hash: newRefreshTokenHash,
        last_seen: new Date(),
        status: "active",
      });

    return { agentId, refreshToken: newRefreshToken };
  }

  async regenerateActivationKey(agentId: string, audit?: AuditContext) {
    const agent = await this.db("agents").where({ id: agentId }).first();
    if (!agent) throw new Error("Agente no encontrado");

    const key = crypto.randomBytes(32).toString("hex"); // 64 chars hex
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db("agents").where({ id: agentId }).update({
      activation_key: key,
      activation_expires_at: expiresAt,
      status: "pending",
      hardware_id: null,
      refresh_token_hash: null,
    });

    await this.db("audit_logs").insert({
      action: "REGENERATE_KEY",
      target_id: agentId,
      user_id: audit?.userId ?? null,
      ip_address: audit?.ip ?? null,
      metadata: JSON.stringify({ reason: "Manual key regeneration from portal" }),
    });

    return { agentId, key, expiresAt };
  }

  /**
   * Revoca el token de acceso de un agente, añadiéndolo a la blacklist de Redis.
   * @param redis - Cliente Redis para gestión de blacklist.
   * @param agentId - UUID del agente a revocar.
   * @param ttlSeconds - Tiempo de vida de la blacklist en segundos.
   * @param requestIp - IP del solicitante (para registro de auditoría).
   */
  async revokeToken(redis: RedisClient, agentId: string, ttlSeconds: number, requestIp?: string) {
    await redis.set(`blacklist:${agentId}`, "true", "EX", ttlSeconds);
    await this.db("agents").where({ id: agentId }).update({ status: "revoked" });

    await this.db("audit_logs").insert({
      action: "REVOKE_TOKEN",
      target_id: agentId,
      ip_address: requestIp || null,
      metadata: JSON.stringify({ reason: "Manual revocation from portal" }),
    });
  }

  /** Verifica si un agente está en la blacklist de Redis (token revocado). */
  async isBlacklisted(redis: RedisClient, agentId: string) {
    const val = await redis.get(`blacklist:${agentId}`);
    return !!val;
  }
}
