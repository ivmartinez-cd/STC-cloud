import { Knex } from "knex";
import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AgentService {
  constructor(private db: Knex) {}

  async createActivationKey(
    clientId: string,
    name: string,
    config?: { ip_ranges?: any[]; snmp_community?: string; scan_interval_minutes?: number }
  ) {
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
      ip_ranges: config?.ip_ranges ? JSON.stringify(config.ip_ranges) : null,
      snmp_community: config?.snmp_community ?? "public",
      scan_interval_minutes: config?.scan_interval_minutes ?? 15,
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
      .where({ id: agentId, status: "active" })
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
      });

    return { agentId, refreshToken: newRefreshToken };
  }

  async updateConfig(agentId: string, newConfig: any) {
    const updates: Record<string, unknown> = {};

    if (newConfig.ip_ranges !== undefined) {
      updates.ip_ranges = JSON.stringify(newConfig.ip_ranges);
    }
    if (newConfig.snmp_community !== undefined) {
      updates.snmp_community = newConfig.snmp_community;
    }
    if (newConfig.scan_interval_minutes !== undefined) {
      updates.scan_interval_minutes = newConfig.scan_interval_minutes;
    }
    if (newConfig.name !== undefined) {
      updates.name = newConfig.name;
    }

    if (Object.keys(updates).length > 0) {
      await this.db("agents").where({ id: agentId }).update(updates);
    }

    await this.db("audit_logs").insert({
      action: "UPDATE_CONFIG",
      target_id: agentId,
      metadata: JSON.stringify(newConfig),
    });

    return { status: "success" };
  }

  async regenerateActivationKey(agentId: string) {
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
      metadata: JSON.stringify({ reason: "Manual key regeneration from portal" }),
    });

    return { agentId, key, expiresAt };
  }

  async registerDevices(agentId: string, devices: any[]) {
    for (const device of devices) {
      await this.db("devices")
        .insert({
          id: crypto.randomUUID(),
          agent_id: agentId,
          ip: device.ip,
          mac: device.mac,
          serial: device.serial,
          brand: device.brand,
          model: device.model,
          name: device.name,
        })
        .onConflict("mac")
        .merge(["ip", "serial", "model", "name", "agent_id"]);
    }
  }

  // Bug #4 corregido: se elimina la IP hardcodeada, se usa r.ip del payload
  async syncReadings(redis: any, readings: any[], agentId: string) {
    if (!readings || readings.length === 0) return;

    const mappedReadings: any[] = [];

    for (const r of readings) {
      let device = await this.db("devices")
        .where({ agent_id: agentId })
        .andWhere(function () {
          this.where("serial", r.device_id).orWhere("ip", r.ip || "");
        })
        .first();

      let deviceId = device?.id;

      if (!deviceId) {
        // Auto-registrar dispositivo desconocido con los datos del payload
        deviceId = crypto.randomUUID();
        await this.db("devices").insert({
          id: deviceId,
          agent_id: agentId,
          ip: r.ip || null,       // null si el agente no mandó IP (antes era IP hardcodeada)
          serial: r.device_id,
          name: r.device_id,
          brand: r.brand || "unknown",
        });
      }

      mappedReadings.push({
        time: new Date(r.time),
        device_id: deviceId,
        total_pages: r.total_pages ?? null,
        mono_pages:  r.mono_pages  ?? null,
        color_pages: r.color_pages ?? null,
        status:      r.status || "idle",
        offline:     r.offline ?? false,
      });
    }

    await this.db("readings").insert(mappedReadings);

    // Encolar evaluación de alertas de forma asíncrona
    try {
      const { Queue } = require("bullmq");
      const readingsQueue = new Queue("readings-queue", { connection: redis });
      await readingsQueue.add("evaluate-readings", { readings: mappedReadings });
    } catch (e) {
      console.error("[SYNC] BullMQ no disponible:", e);
    }
  }

  async sendCommand(redis: any, agentId: string, type: string, payload: any) {
    const cmd = JSON.stringify({ type, payload, timestamp: new Date() });
    await redis.lpush(`commands:${agentId}`, cmd);
    await redis.expire(`commands:${agentId}`, 600); // 10 min TTL
  }

  async getCommands(redis: any, agentId: string) {
    const cmds = await redis.lrange(`commands:${agentId}`, 0, -1);
    await redis.del(`commands:${agentId}`);
    return cmds.map((c: string) => JSON.parse(c));
  }

  async revokeToken(redis: any, agentId: string, ttlSeconds: number, requestIp?: string) {
    await redis.set(`blacklist:${agentId}`, "true", "EX", ttlSeconds);
    await this.db("agents").where({ id: agentId }).update({ status: "revoked" });

    await this.db("audit_logs").insert({
      action: "REVOKE_TOKEN",
      target_id: agentId,
      ip_address: requestIp || null,
      metadata: JSON.stringify({ reason: "Manual revocation from portal" }),
    });
  }

  async isBlacklisted(redis: any, agentId: string) {
    const val = await redis.get(`blacklist:${agentId}`);
    return !!val;
  }

  async heartbeat(agentId: string) {
    await this.db("agents")
      .where({ id: agentId })
      .update({ last_seen: new Date() });
  }

  async getConfig(agentId: string) {
    const agent = await this.db("agents")
      .where({ id: agentId })
      .select("ip_ranges", "snmp_community", "scan_interval_minutes")
      .first();
    
    if (agent && typeof agent.ip_ranges === 'string') {
      agent.ip_ranges = JSON.parse(agent.ip_ranges);
    }
    return agent;
  }
}
