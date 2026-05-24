import { Knex } from "knex";
import crypto from "crypto";
import { Queue } from "bullmq";

// ─── Interfaces de Tipado Fuerte ──────────────────────────────────────────────
// Estas interfaces reemplazan los tipos `any` para cumplir con la Regla 5
// (Strict TypeScript) de ANTIGRAVITY_SKILLS.md.

/** Interfaz mínima del cliente Redis utilizado para blacklists y colas. */
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, duration: number): Promise<string | null>;
}

/** Contexto de auditoría opcional para trazar el operador e IP origen de una acción administrativa. */
export interface AuditContext {
  userId?: string;
  ip?: string;
}

/** Configuración de red y escaneo enviada desde el portal para actualizar un agente. */
export interface AgentConfigUpdate {
  ip_ranges?: Array<{ start: string; end: string }>;
  snmp_community?: string;
  scan_interval_minutes?: number;
  name?: string;
  toner_warning_threshold?: number;
  toner_critical_threshold?: number;
}

/** Dispositivo entrante desde el agente DCA durante el registro inicial. */
export interface IncomingDevice {
  ip: string;
  serial: string | null;
  brand: string;
  model: string;
  name: string;
}

/** Entrada de log remoto enviada por el agente DCA. */
export interface IncomingLogEntry {
  timestamp?: string;
  time?: string;
  level?: string;
  message: string;
}

/** Lectura de telemetría entrante desde el agente DCA durante la sincronización. */
export interface IncomingReading {
  device_id: string;
  ip?: string;
  brand?: string;
  model?: string;
  name?: string;
  time?: string;
  total_pages?: number | string | null;
  mono_pages?: number | string | null;
  color_pages?: number | string | null;
  toner_black?: number | string | null;
  toner_cyan?: number | string | null;
  toner_magenta?: number | string | null;
  toner_yellow?: number | string | null;
  cartridge_code_black?: string | null;
  cartridge_code_cyan?: string | null;
  cartridge_code_magenta?: string | null;
  cartridge_code_yellow?: string | null;
  cartridge_serial_black?: string | null;
  cartridge_serial_cyan?: string | null;
  cartridge_serial_magenta?: string | null;
  cartridge_serial_yellow?: string | null;
  cartridge_capacity_black?: number | string | null;
  cartridge_capacity_cyan?: number | string | null;
  cartridge_capacity_magenta?: number | string | null;
  cartridge_capacity_yellow?: number | string | null;
  cartridge_printed_black?: number | string | null;
  cartridge_printed_cyan?: number | string | null;
  cartridge_printed_magenta?: number | string | null;
  cartridge_printed_yellow?: number | string | null;
  cartridge_estimated_black?: number | string | null;
  cartridge_estimated_cyan?: number | string | null;
  cartridge_estimated_magenta?: number | string | null;
  cartridge_estimated_yellow?: number | string | null;
  poll_method?: string;
  offline?: boolean;
}

/** Información de sistema enviada por el agente en cada heartbeat. */
export interface SystemInfoPayload {
  version?: string;
  host_name?: string;
  host_os?: string;
  host_ip?: string;
  uptime?: number;
}

/** Lectura procesada y mapeada lista para inserción en la tabla `readings`. */
interface MappedReading {
  id: string;
  time: Date;
  device_id: string;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  offline: boolean;
}

// ─── Utilidades Internas ──────────────────────────────────────────────────────

/**
 * Genera un hash SHA-256 de un token para almacenamiento seguro en base de datos.
 * Se utiliza para almacenar refresh tokens sin exponer el valor original.
 * @param token - Token de texto plano a hashear.
 * @returns Hash hexadecimal de 64 caracteres.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Servicio Principal de Agentes ────────────────────────────────────────────

/**
 * Servicio central de lógica de negocio para la gestión de agentes DCA.
 * Encapsula operaciones de activación, sincronización de telemetría,
 * gestión de dispositivos y control de comandos remotos.
 *
 * @remarks
 * Todas las consultas a la base de datos utilizan Knex.js con parametrización
 * obligatoria para prevenir inyecciones SQL (ver SECURITY_AUDIT.md §3).
 */
export class AgentService {
  constructor(private db: Knex, private redis?: RedisClient) {}

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
    config?: Pick<AgentConfigUpdate, 'ip_ranges' | 'snmp_community' | 'scan_interval_minutes'>,
    audit?: AuditContext
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

  /**
   * Actualiza la configuración de red y escaneo de un agente existente.
   * Solo los campos proporcionados se actualizan; los demás permanecen intactos.
   * @param agentId - UUID del agente a configurar.
   * @param newConfig - Objeto parcial con los campos a modificar.
   */
  async updateConfig(agentId: string, newConfig: AgentConfigUpdate, audit?: AuditContext) {
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
    if (newConfig.toner_warning_threshold !== undefined) {
      updates.toner_warning_threshold = newConfig.toner_warning_threshold;
    }
    if (newConfig.toner_critical_threshold !== undefined) {
      updates.toner_critical_threshold = newConfig.toner_critical_threshold;
    }

    if (Object.keys(updates).length > 0) {
      await this.db("agents").where({ id: agentId }).update(updates);
    }

    await this.db("audit_logs").insert({
      action: "UPDATE_CONFIG",
      target_id: agentId,
      user_id: audit?.userId ?? null,
      ip_address: audit?.ip ?? null,
      metadata: JSON.stringify(newConfig),
    });

    return { status: "success" };
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
   * Registra o actualiza dispositivos de impresión descubiertos por el agente.
   * Utiliza `ON CONFLICT` sobre `(agent_id, serial_number)` para evitar duplicados.
   * @param agentId - UUID del agente que reporta los dispositivos.
   * @param devices - Array de dispositivos descubiertos en la red local del cliente.
   */
  async registerDevices(agentId: string, devices: IncomingDevice[]) {
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
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[AGENT_SERVICE] Error registering device ${device.ip}:`, errMsg);
        throw e;
      }
    }
  }

  // --- Remote Logs & Commands ---

  /**
   * Ingesta de logs remotos enviados por el agente DCA.
   * Soporta timestamps en formato DD/MM/YYYY y ISO 8601.
   * @param agentId - UUID del agente emisor.
   * @param logs - Array de entradas de log con timestamp, nivel y mensaje.
   */
  async ingestLogs(agentId: string, logs: IncomingLogEntry[]) {
    if (!logs || logs.length === 0) return;
    
    const rows = logs.map(l => {
      let ts: Date;
      const raw = l.timestamp || l.time; // Soportar ambos nombres de campo
      
      if (raw) {
        // Heurística para detectar DD/MM/YYYY HH:mm:ss (formato común de agentes locales)
        const parts = String(raw).match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          // Si parece DD/MM/YYYY, lo rearmamos a YYYY-MM-DD para que el constructor de Date no se confunda
          const timePart = String(raw).split(' ')[1] || '00:00:00';
          // Forzamos offset -03:00 para asegurar que se interprete como hora local de Argentina
          ts = new Date(`${parts[3]}-${parts[2]}-${parts[1]}T${timePart}-03:00`);
        } else {
          ts = new Date(raw);
        }
      } else {
        ts = new Date();
      }

      return {
        agent_id: agentId,
        level: l.level || 'INFO',
        message: l.message,
        timestamp: isNaN(ts.getTime()) ? new Date() : ts
      };
    });

    await this.db("agent_logs").insert(rows);
  }

  // --- Remote Logs & Commands (Consolidados abajo) ---

  async getLogs(agentId: string, limit: number = 50) {
    return await this.db("agent_logs")
      .where({ agent_id: agentId })
      .orderBy("timestamp", "desc")
      .limit(limit);
  }

  // Actualiza o crea dispositivos y registra lecturas
  /**
   * Sincroniza lecturas de telemetría desde el agente hacia la base de datos cloud.
   * Para cada lectura, realiza un UPSERT del dispositivo por serial_number y
   * registra la lectura en el historial de la tabla `readings`.
   *
   * @remarks
   * - Las lecturas se asocian al dispositivo por su número de serie físico inmutable.
   * - Utiliza `ON CONFLICT (agent_id, serial_number)` para prevenir duplicados.
   * - Los contadores se parsean con validación estricta (parseCount/parseToner).
   *
   * @param redis - Cliente Redis para encolar evaluaciones de alertas asíncronas.
   * @param readings - Array de lecturas crudas enviadas por el agente DCA.
   * @param agentId - UUID del agente emisor de la telemetría.
   */
  async syncReadings(redis: RedisClient, readings: IncomingReading[], agentId: string) {
    if (!readings || readings.length === 0) return;

    const mappedReadings: MappedReading[] = [];

    // Procesando lecturas (log removido por ruido en producción)
    
    const parseCount = (v: number | string | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      return isNaN(n) ? null : n;
    };

    const parseToner = (v: number | string | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      if (isNaN(n)) return null;
      return Math.min(100, Math.max(0, n));
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

        const pollMethod = (r.poll_method || 'snmp').slice(0, 20);

        const upserted = await this.db.raw<{ rows: { id: string }[] }>(`
          INSERT INTO devices (
            id, agent_id, ip_address, serial_number, name, brand, model, active, last_seen,
            total_pages, mono_pages, color_pages, poll_method,
            toner_black, toner_cyan, toner_magenta, toner_yellow,
            cartridge_code_black, cartridge_code_cyan, cartridge_code_magenta, cartridge_code_yellow,
            cartridge_serial_black, cartridge_serial_cyan, cartridge_serial_magenta, cartridge_serial_yellow,
            cartridge_capacity_black, cartridge_capacity_cyan, cartridge_capacity_magenta, cartridge_capacity_yellow,
            cartridge_printed_black, cartridge_printed_cyan, cartridge_printed_magenta, cartridge_printed_yellow,
            cartridge_estimated_black, cartridge_estimated_cyan, cartridge_estimated_magenta, cartridge_estimated_yellow
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            color_pages   = EXCLUDED.color_pages,
            poll_method   = EXCLUDED.poll_method,
            toner_black   = EXCLUDED.toner_black,
            toner_cyan    = EXCLUDED.toner_cyan,
            toner_magenta = EXCLUDED.toner_magenta,
            toner_yellow  = EXCLUDED.toner_yellow,
            cartridge_code_black       = COALESCE(EXCLUDED.cartridge_code_black,       devices.cartridge_code_black),
            cartridge_code_cyan        = COALESCE(EXCLUDED.cartridge_code_cyan,        devices.cartridge_code_cyan),
            cartridge_code_magenta     = COALESCE(EXCLUDED.cartridge_code_magenta,     devices.cartridge_code_magenta),
            cartridge_code_yellow      = COALESCE(EXCLUDED.cartridge_code_yellow,      devices.cartridge_code_yellow),
            cartridge_serial_black     = COALESCE(EXCLUDED.cartridge_serial_black,     devices.cartridge_serial_black),
            cartridge_serial_cyan      = COALESCE(EXCLUDED.cartridge_serial_cyan,      devices.cartridge_serial_cyan),
            cartridge_serial_magenta   = COALESCE(EXCLUDED.cartridge_serial_magenta,   devices.cartridge_serial_magenta),
            cartridge_serial_yellow    = COALESCE(EXCLUDED.cartridge_serial_yellow,    devices.cartridge_serial_yellow),
            cartridge_capacity_black   = COALESCE(EXCLUDED.cartridge_capacity_black,   devices.cartridge_capacity_black),
            cartridge_capacity_cyan    = COALESCE(EXCLUDED.cartridge_capacity_cyan,    devices.cartridge_capacity_cyan),
            cartridge_capacity_magenta = COALESCE(EXCLUDED.cartridge_capacity_magenta, devices.cartridge_capacity_magenta),
            cartridge_capacity_yellow  = COALESCE(EXCLUDED.cartridge_capacity_yellow,  devices.cartridge_capacity_yellow),
            cartridge_printed_black    = COALESCE(EXCLUDED.cartridge_printed_black,    devices.cartridge_printed_black),
            cartridge_printed_cyan     = COALESCE(EXCLUDED.cartridge_printed_cyan,     devices.cartridge_printed_cyan),
            cartridge_printed_magenta  = COALESCE(EXCLUDED.cartridge_printed_magenta,  devices.cartridge_printed_magenta),
            cartridge_printed_yellow   = COALESCE(EXCLUDED.cartridge_printed_yellow,   devices.cartridge_printed_yellow),
            cartridge_estimated_black    = COALESCE(EXCLUDED.cartridge_estimated_black,    devices.cartridge_estimated_black),
            cartridge_estimated_cyan     = COALESCE(EXCLUDED.cartridge_estimated_cyan,     devices.cartridge_estimated_cyan),
            cartridge_estimated_magenta  = COALESCE(EXCLUDED.cartridge_estimated_magenta,  devices.cartridge_estimated_magenta),
            cartridge_estimated_yellow   = COALESCE(EXCLUDED.cartridge_estimated_yellow,   devices.cartridge_estimated_yellow)
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
          parseCount(r.color_pages),
          pollMethod,
          parseToner(r.toner_black),
          parseToner(r.toner_cyan),
          parseToner(r.toner_magenta),
          parseToner(r.toner_yellow),
          r.cartridge_code_black       ?? null,
          r.cartridge_code_cyan        ?? null,
          r.cartridge_code_magenta     ?? null,
          r.cartridge_code_yellow      ?? null,
          r.cartridge_serial_black     ?? null,
          r.cartridge_serial_cyan      ?? null,
          r.cartridge_serial_magenta   ?? null,
          r.cartridge_serial_yellow    ?? null,
          r.cartridge_capacity_black   ?? null,
          r.cartridge_capacity_cyan    ?? null,
          r.cartridge_capacity_magenta ?? null,
          r.cartridge_capacity_yellow  ?? null,
          r.cartridge_printed_black    ?? null,
          r.cartridge_printed_cyan     ?? null,
          r.cartridge_printed_magenta  ?? null,
          r.cartridge_printed_yellow   ?? null,
          r.cartridge_estimated_black  ?? null,
          r.cartridge_estimated_cyan   ?? null,
          r.cartridge_estimated_magenta ?? null,
          r.cartridge_estimated_yellow  ?? null,
        ]);

        if (!upserted.rows || upserted.rows.length === 0) {
          throw new Error("Upsert no retornó ID del dispositivo");
        }

        const deviceId = upserted.rows[0].id;

        // Parseo seguro de fecha (detectar DD/MM/YYYY)
        let readingTime: Date;
        const rawTime = r.time || "";
        const dateParts = String(rawTime).match(/(\d{2})\/(\d{2})\/(\d{4})/);
        
        if (dateParts) {
          const timePart = String(rawTime).split(' ')[1] || '00:00:00';
          // Forzamos offset -03:00 para asegurar que se interprete como hora local de Argentina
          readingTime = new Date(`${dateParts[3]}-${dateParts[2]}-${dateParts[1]}T${timePart}-03:00`);
        } else {
          readingTime = new Date(rawTime);
        }

        if (isNaN(readingTime.getTime())) {
          readingTime = new Date(); 
        }

        mappedReadings.push({
          id:           crypto.randomUUID(),
          time:         readingTime,
          device_id:    deviceId,
          total_pages:  parseCount(r.total_pages),
          mono_pages:   parseCount(r.mono_pages),
          color_pages:  parseCount(r.color_pages),
          toner_black:  parseToner(r.toner_black),
          toner_cyan:   parseToner(r.toner_cyan),
          toner_magenta: parseToner(r.toner_magenta),
          toner_yellow: parseToner(r.toner_yellow),
          offline:      r.offline ?? false,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SYNC] Error procesando dispositivo ${r.device_id}:`, errMsg);
        // Continuamos con el resto de la tanda para no bloquear todo el agente
        await this.ingestLogs(agentId, [{
          time: new Date().toISOString(),
          level: 'ERROR',
          message: `Device Sync Fail [${r.ip || r.device_id}]: ${errMsg}`
        }]);
      }
    }

    if (mappedReadings.length > 0) {
      try {
        // Inserción masiva de lecturas en el historial
        await this.db("readings").insert(mappedReadings);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[SYNC] Error al insertar lecturas:", errMsg);
        await this.ingestLogs(agentId, [{
          time: new Date().toISOString(),
          level: 'ERROR',
          message: `Readings Insert Error: ${errMsg}`
        }]);
        throw err;
      }
    }

    // Encolar evaluación de alertas de forma asíncrona
    try {
      const readingsQueue = new Queue("readings-queue", { connection: this.redis as unknown as import("ioredis").Redis });
      await readingsQueue.add("evaluate-readings", { readings: mappedReadings });
    } catch (e: unknown) {
      console.error("[SYNC] BullMQ no disponible:", e);
    }

    // Actualizar también el heartbeat del agente al sincronizar
    await this.heartbeat(agentId);
  }

  /**
   * Registra un comando remoto pendiente para un agente DCA.
   * @param agentId - UUID del agente destinatario.
   * @param type - Tipo de comando (FORCE_SCAN, RESTART, UPDATE_CONFIG, etc.).
   * @param payload - Datos adicionales del comando.
   * @param createdBy - ID del usuario del portal que originó el comando.
   */
  async addCommand(agentId: string, type: string, payload: Record<string, unknown> = {}, createdBy?: string) {
    const [command] = await this.db("agent_commands").insert({
      agent_id: agentId,
      type,
      payload: JSON.stringify(payload),
      status: "pending",
      created_by: createdBy || null,
    }).returning("*");
    return command;
  }

  async getPendingCommands(agentId: string) {
    const commands = await this.db("agent_commands")
      .where({ agent_id: agentId, status: "pending" })
      .select("id", "type", "payload");

    if (commands.length > 0) {
      // Marcar como enviados para que no se repitan
      await this.db("agent_commands")
        .whereIn("id", commands.map(c => c.id))
        .update({ status: "sent", sent_at: new Date() });
    }

    return commands.map(c => ({
      id: c.id,
      type: c.type,
      payload: typeof c.payload === "string" ? JSON.parse(c.payload) : c.payload,
    }));
  }

  /** Actualiza el resultado de un comando ejecutado por el agente. */
  async updateCommandResult(commandId: string, status: string, result: Record<string, unknown> | null) {
    await this.db("agent_commands")
      .where({ id: commandId })
      .update({
        status,
        result: result ? JSON.stringify(result) : null,
        executed_at: new Date()
      });
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


  /**
   * Registra un latido (heartbeat) del agente, actualizando su último contacto
   * e información de sistema operativo del host.
   * @param agentId - UUID del agente emisor.
   * @param systemInfo - Datos opcionales del sistema (versión, hostname, OS, IP).
   */
  async heartbeat(agentId: string, systemInfo?: SystemInfoPayload) {
    const updateData: Record<string, unknown> = {
      last_seen: new Date(),
      status: this.db.raw("CASE WHEN status = 'offline' THEN 'active' ELSE status END")
    };
    
    if (systemInfo) {
      if (systemInfo.version !== undefined) updateData.version = systemInfo.version;
      if (systemInfo.host_name !== undefined) updateData.host_name = systemInfo.host_name;
      if (systemInfo.host_os !== undefined) updateData.host_os = systemInfo.host_os;
      if (systemInfo.host_ip !== undefined) updateData.host_ip = systemInfo.host_ip;
      if (systemInfo.uptime !== undefined) updateData.uptime = systemInfo.uptime;
    }

    await this.db("agents")
      .where({ id: agentId })
      .update(updateData);
  }

  async getConfig(agentId: string) {
    const agent = await this.db("agents")
      .where({ id: agentId })
      .select("ip_ranges", "snmp_community", "scan_interval_minutes", "toner_warning_threshold", "toner_critical_threshold")
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
