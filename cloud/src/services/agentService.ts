import { Knex } from "knex";
import crypto from "crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AgentService {
  constructor(private db: Knex, private redis?: any) {}

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
      try {
        await this.db.raw(`
          INSERT INTO devices (id, agent_id, ip_address, serial_number, brand, model, name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (agent_id, serial_number) WHERE serial_number IS NOT NULL
          DO UPDATE SET
            ip_address = COALESCE(EXCLUDED.ip_address, devices.ip_address),
            brand      = COALESCE(EXCLUDED.brand,      devices.brand),
            model      = COALESCE(EXCLUDED.model,      devices.model),
            name       = COALESCE(EXCLUDED.name,       devices.name)
        `, [
          crypto.randomUUID(),
          agentId,
          device.ip,
          device.serial || null,
          device.brand || 'unknown',
          (device.model || "").slice(0, 100),
          (device.name || "").slice(0, 100)
        ]);
      } catch (e: any) {
        console.error(`[AGENT_SERVICE] Error registering device ${device.ip}:`, e.message);
        throw e;
      }
    }
  }

  // --- Remote Logs & Commands ---

  async ingestLogs(agentId: string, logs: any[]) {
    if (!logs || logs.length === 0) return;
    
    const rows = logs.map(l => ({
      agent_id: agentId,
      level: l.level || 'INFO',
      message: l.message,
      timestamp: new Date(l.timestamp || Date.now())
    }));

    await this.db("agent_logs").insert(rows);
  }

  async getPendingCommands(agentId: string) {
    const commands = await this.db("agent_commands")
      .where({ agent_id: agentId, status: "pending" })
      .orderBy("created_at", "asc")
      .select("id", "type", "payload");

    if (commands.length > 0) {
      const ids = commands.map(c => c.id);
      await this.db("agent_commands").whereIn("id", ids).update({ status: "running" });
    }

    return commands;
  }

  async updateCommandResult(commandId: string, status: string, result: any) {
    await this.db("agent_commands")
      .where({ id: commandId })
      .update({
        status,
        result: result ? JSON.stringify(result) : null,
        executed_at: new Date()
      });
  }

  async queueCommand(agentId: string, type: string, payload: any = {}) {
    const [command] = await this.db("agent_commands").insert({
      agent_id: agentId,
      type,
      payload: JSON.stringify(payload),
      status: "pending"
    }).returning("*");
    return command;
  }

  async getLogs(agentId: string, limit: number = 50) {
    return await this.db("agent_logs")
      .where({ agent_id: agentId })
      .orderBy("timestamp", "desc")
      .limit(limit);
  }

  // Actualiza o crea dispositivos y registra lecturas
  async syncReadings(redis: any, readings: any[], agentId: string) {
    if (!readings || readings.length === 0) return;

    const mappedReadings: any[] = [];

    console.log(`[SYNC] Procesando ${readings.length} lecturas para agente ${agentId}`);
    
    const parseCount = (v: any) => {
      if (v === null || v === undefined) return null;
      const n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    };
    
    for (const r of readings) {
      try {
        // Limpiar marca si viene genérica
        let brand = r.brand || "unknown";
        if (brand.toLowerCase() === 'generic' && r.model) {
          if (r.model.toLowerCase().includes('samsung')) brand = 'Samsung';
          else if (r.model.toLowerCase().includes('lexmark')) brand = 'Lexmark';
          else if (r.model.toLowerCase().includes('hp')) brand = 'HP';
          else if (r.model.toLowerCase().includes('ricoh')) brand = 'Ricoh';
          else if (r.model.toLowerCase().includes('brother')) brand = 'Brother';
          else if (r.model.toLowerCase().includes('xerox')) brand = 'Xerox';
        }

        // ── Fase 5: Estilización Forzada (Backend) ───────────────────────────
        // Limpiamos el nombre: Tomamos r.name o r.model y cortamos en el primer separador técnico (; | \r \n)
        const sourceName = r.name || r.model || r.device_id || "Unknown";
        let friendlyName = sourceName.split(/[;|\r\n]/)[0].trim();

        // Quitar el prefijo de la marca si está presente (ej: "SAMSUNG SL-M..." -> "SL-M...")
        const bLower = brand.toLowerCase();
        if (friendlyName.toLowerCase().startsWith(bLower)) {
          friendlyName = friendlyName.slice(bLower.length).trim();
        }

        // Si después de limpiar queda vacío o muy corto, usamos el ID
        if (friendlyName.length < 2) friendlyName = r.device_id;

        // Limpiar también el modelo para que no guarde basura
        const cleanModel = (r.model || "unknown").split(/[;|\r\n]/)[0].trim();

        const upserted = await this.db.raw<{ rows: { id: string }[] }>(`
          INSERT INTO devices (id, agent_id, ip_address, serial_number, name, brand, model, active, last_seen, total_pages, mono_pages, color_pages)
          VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(), ?, ?, ?)
          ON CONFLICT (agent_id, serial_number) WHERE serial_number IS NOT NULL
          DO UPDATE SET
            ip_address    = EXCLUDED.ip_address,
            brand         = COALESCE(NULLIF(EXCLUDED.brand, 'unknown'), devices.brand),
            model         = COALESCE(EXCLUDED.model, devices.model),
            name          = CASE 
                              WHEN devices.name IS NULL 
                                OR devices.name = devices.serial_number 
                                OR devices.name LIKE '%;%' 
                                OR devices.name LIKE '%V4.%' 
                              THEN EXCLUDED.name
                              ELSE devices.name 
                            END,
            last_seen     = NOW(),
            active        = true,
            total_pages   = EXCLUDED.total_pages,
            mono_pages    = EXCLUDED.mono_pages,
            color_pages   = EXCLUDED.color_pages
          RETURNING id
        `, [
          crypto.randomUUID(),
          agentId,
          r.ip || null,
          (r.device_id || "").slice(0, 150), // serial_number
          friendlyName.slice(0, 255),
          brand.slice(0, 100),
          cleanModel.slice(0, 255),
          parseCount(r.total_pages),
          parseCount(r.mono_pages),
          parseCount(r.color_pages)
        ]);

        if (!upserted.rows || upserted.rows.length === 0) {
          throw new Error("Upsert no retornó ID del dispositivo");
        }

        const deviceId = upserted.rows[0].id;

        // Parseo seguro de fecha
        let readingTime = new Date(r.time);
        if (isNaN(readingTime.getTime())) {
          readingTime = new Date(); // Fallback a ahora si la fecha es inválida
        }

        mappedReadings.push({
          id: crypto.randomUUID(),
          time: readingTime,
          device_id: deviceId,
          total_pages: parseCount(r.total_pages),
          mono_pages:  parseCount(r.mono_pages),
          color_pages: parseCount(r.color_pages),
          offline:     r.offline ?? false,
        });
      } catch (err: any) {
        console.error(`[SYNC] Error procesando dispositivo ${r.device_id}:`, err.message);
        // Continuamos con el resto de la tanda para no bloquear todo el agente
        await this.ingestLogs(agentId, [{
          time: new Date().toISOString(),
          level: 'ERROR',
          message: `Device Sync Fail [${r.ip || r.device_id}]: ${err.message}`
        }]);
      }
    }

    if (mappedReadings.length > 0) {
      try {
        // Inserción masiva de lecturas en el historial
        await this.db("readings").insert(mappedReadings);
      } catch (err: any) {
        console.error("[SYNC] Error al insertar lecturas:", err.message);
        await this.ingestLogs(agentId, [{
          time: new Date().toISOString(),
          level: 'ERROR',
          message: `Readings Insert Error: ${err.message}`
        }]);
        throw err;
      }
    }

    // Encolar evaluación de alertas de forma asíncrona
    try {
      const { Queue } = require("bullmq");
      const readingsQueue = new Queue("readings-queue", { connection: this.redis });
      await readingsQueue.add("evaluate-readings", { readings: mappedReadings });
    } catch (e) {
      console.error("[SYNC] BullMQ no disponible:", e);
    }
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

  async globalSearch(query: string) {
    const q = `%${query}%`;
    
    const [clients, devices] = await Promise.all([
      this.db("clients")
        .where("name", "ILIKE", q)
        .select("id", "name")
        .limit(5),
      this.db("devices")
        .where("serial_number", "ILIKE", q)
        .orWhere("brand", "ILIKE", q)
        .orWhere("model", "ILIKE", q)
        .orWhere("name", "ILIKE", q)
        .select("id", "serial_number", "brand", "model", "name")
        .limit(5)
    ]);

    return { clients, devices };
  }
}
