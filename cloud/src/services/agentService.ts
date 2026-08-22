import { Knex } from "knex";
import crypto from "crypto";
import net from "net";
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

export interface ScanSchedule {
  mode: "interval" | "custom";
  interval_minutes?: number;
  custom_days?: number[];  // [1, 2, 3, 4, 5] (1=Lunes, 7=Domingo)
  custom_times?: string[]; // ["09:00", "15:00"]
}

/** Configuración de red y escaneo enviada desde el portal para actualizar un agente. */
export interface AgentConfigUpdate {
  ip_ranges?: Array<{ start: string; end: string }>;
  snmp_community?: string;
  scan_interval_minutes?: number;
  scan_schedule?: ScanSchedule;
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
  reading_id?: string | null;
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
  supplies_details?: any;
  firmware?: string | null;
  mac?: string | null;
  hostname?: string | null;
  location?: string | null;
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
  id?: string;
  reading_id?: string | null;
  time: Date;
  device_id: string;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  supplies_details?: any;
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
/**
 * Fusión por secciones de supplies_details. Cada loop del agente es dueño de un grupo de claves:
 *  - loop de insumos  (trae `toners`)   → reemplaza toners/drums/maintenance/alerts/inputTrays/outputTrays
 *  - loop de contadores (trae `counters`) → reemplaza counters
 *  - `device` se fusiona clave a clave.
 * Así un kit que el equipo dejó de reportar (o datos viejos de otro parser) no queda "pegado" para siempre.
 */
function mergeSuppliesDetails(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  if ("toners" in incoming) {
    for (const k of ["toners", "drums", "maintenance", "alerts", "inputTrays", "outputTrays"]) delete out[k];
  }
  if ("counters" in incoming) delete out["counters"];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null) continue;
    if (k === "device" && typeof v === "object" && typeof out["device"] === "object" && out["device"]) {
      out["device"] = { ...(out["device"] as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Extrae supplies_details.device.sku (objeto o string JSON) con tipado seguro. */
function skuFrom(sd: unknown): string | null {
  try {
    const obj = typeof sd === "string" ? JSON.parse(sd) as unknown : sd;
    if (obj && typeof obj === "object") {
      const dev = (obj as { device?: { sku?: unknown } }).device;
      const sku = dev?.sku;
      if (typeof sku === "string" && sku.trim()) return sku.trim().slice(0, 50);
    }
  } catch { /* ignore */ }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida formato UUID antes de insertar en una columna `uuid` (evita error de tipo en Postgres). */
function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

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
    if (newConfig.scan_schedule !== undefined) {
      updates.scan_schedule = JSON.stringify(newConfig.scan_schedule);
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
        const ip = device.ip;
        const serial = (device.serial || "").trim();
        const isRealSerial = serial.length > 0 && serial !== ip;

        // 1. Si el serial es real, verificar si existe un registro fantasma en esta IP para actualizarlo
        if (isRealSerial) {
          const ghostDevices = await this.db("devices")
            .where({ agent_id: agentId, ip_address: ip })
            .andWhere((b) => b.whereNull("serial_number").orWhere("serial_number", ip))
            .select("id");

          if (ghostDevices.length > 0) {
            const ghostId = ghostDevices[0].id;
            await this.db("devices")
              .where("id", ghostId)
              .update({
                serial_number: serial,
                brand: device.brand && device.brand !== 'unknown' ? device.brand : undefined,
                model: device.model || undefined,
                name: device.name || undefined,
                last_seen: new Date(),
                active: true,
              });
            continue;
          }
        }

        // 2. Si el serial es temporal/nulo, verificar si YA EXISTE algún equipo registrado en esta IP
        if (!isRealSerial) {
          const existingDevices = await this.db("devices")
            .where({ agent_id: agentId, ip_address: ip })
            .select("id");

          if (existingDevices.length > 0) {
            await this.db("devices")
              .where("id", existingDevices[0].id)
              .update({ last_seen: new Date(), active: true });
            continue;
          }
        }

        // 3. Upsert estándar por (agent_id, serial_number)
        await this.db.raw(`
          INSERT INTO devices (id, agent_id, ip_address, serial_number, brand, model, name, active, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW())
          ON CONFLICT (agent_id, serial_number) WHERE serial_number IS NOT NULL
          DO UPDATE SET
            ip_address = EXCLUDED.ip_address,
            brand      = COALESCE(NULLIF(EXCLUDED.brand, 'unknown'), devices.brand),
            model      = COALESCE(NULLIF(EXCLUDED.model, ''), devices.model),
            name       = COALESCE(NULLIF(EXCLUDED.name, ''), devices.name),
            last_seen  = NOW(),
            active     = true
        `, [
          crypto.randomUUID(),
          agentId,
          device.ip,
          serial || null,
          device.brand || 'unknown',
          (device.model || "").slice(0, 100),
          (device.name || "").slice(0, 100)
        ]);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[AGENT_SERVICE] Error registering device ${device.ip}:`, errMsg);
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
    if (!readings || readings.length === 0) return { received: 0, inserted: 0, duplicates: 0 };

    // 0. Actualizar la última conexión del monitor / agente emisor
    try {
      await this.db("agents")
        .where("id", agentId)
        .update({
          last_seen: new Date(),
          status: "active",
        });
    } catch { /* continuar si el agente fue eliminado */ }

    const mappedReadings: MappedReading[] = [];

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
        const rawDeviceId = (r.device_id || "").trim();
        const ip = (r.ip || "").trim();
        const isIpAsSerial = !rawDeviceId || (net.isIP(rawDeviceId) !== 0) || rawDeviceId === ip;

        let serialToUse: string | null = isIpAsSerial ? null : rawDeviceId;

        // 1. Encontrar el equipo destino existente por IP o por Número de Serie
        let existingDevice = null;
        if (ip || serialToUse) {
          existingDevice = await this.db("devices")
            .where({ agent_id: agentId })
            .andWhere((builder) => {
              if (ip) builder.where("ip_address", ip);
              if (serialToUse) builder.orWhere("serial_number", serialToUse);
            })
            .orderByRaw("CASE WHEN serial_number IS NOT NULL AND serial_number != host(ip_address) THEN 0 ELSE 1 END")
            .first();
        }

        // 2. Limpiar marca si viene genérica
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
        const cleanModel = (r.model || "unknown").split(/[;|\r\n]/)[0].trim();
        const rawSerial = serialToUse;
        
        // Hostname válido solo si no es igual al serie ni a la IP
        const validHost = (r.hostname && r.hostname.trim() && r.hostname.trim().toLowerCase() !== rawSerial?.toLowerCase() && r.hostname.trim() !== ip)
          ? r.hostname.trim()
          : null;

        const sourceName = (r.name && r.name !== rawSerial && r.name !== ip) ? r.name : cleanModel;
        let friendlyName = sourceName.split(/[;|\r\n]/)[0].trim();

        const bLower = brand.toLowerCase();
        if (friendlyName.toLowerCase().startsWith(bLower)) {
          friendlyName = friendlyName.slice(bLower.length).trim();
        }

        if (friendlyName.length < 2 || friendlyName === rawSerial) friendlyName = cleanModel;
        const pollMethod = (r.poll_method || 'snmp').slice(0, 20);

        let deviceId: string;

        if (existingDevice) {
          deviceId = existingDevice.id;

          // Conservar número de serie real si ya existía uno registrado
          const finalSerial = (existingDevice.serial_number && existingDevice.serial_number !== ip)
            ? existingDevice.serial_number
            : (serialToUse || existingDevice.serial_number || null);

          // Conservar modelo detallado más largo (para evitar degradaciones a 'hp' o 'generic')
          const existingModel = existingDevice.model || "";
          const NOISE_MODEL = /^(generic|unknown|hp|samsung|lexmark)$|ETHERNET MULTI-ENVIRONMENT|JETDIRECT|\bSeries$/i;
          const isGenericModel = NOISE_MODEL.test(cleanModel);
          const existingIsNoise = NOISE_MODEL.test(existingModel);
          // Un modelo comercial nuevo reemplaza ruido (tarjeta JetDirect, "XXX Series") aunque sea más corto.
          const finalModel = (!isGenericModel && (existingIsNoise || cleanModel.length >= existingModel.length)) ? cleanModel : (existingModel || cleanModel);

          // Conservar nombre amigable si ya está bien formateado
          const existingName = existingDevice.name || "";
          const isGenericOrModelName = !existingName || existingName === finalSerial || existingName.includes("192.168") || existingName.toLowerCase() === finalModel.toLowerCase();
          const finalName = validHost || (isGenericOrModelName ? cleanModel : existingName);

          // Detección de reset/decremento de contador: comparar contra el valor
          // previo (no contra los extremos del período — eso lo corrige el cálculo
          // de volumen mensual). Un reset de firmware o reemplazo de placa
          // formateadora hace que el contador físico baje sin que cambie el serial.
          const newTotal = parseCount(r.total_pages);
          const newMono = parseCount(r.mono_pages);
          const newColor = parseCount(r.color_pages);
          const counterResets: string[] = [];
          let resetValue: number | null = null;
          if (newTotal !== null && existingDevice.total_pages !== null && newTotal < existingDevice.total_pages) {
            counterResets.push(`total: ${existingDevice.total_pages} → ${newTotal}`);
            resetValue = newTotal;
          }
          if (newMono !== null && existingDevice.mono_pages !== null && newMono < existingDevice.mono_pages) {
            counterResets.push(`mono: ${existingDevice.mono_pages} → ${newMono}`);
            resetValue = resetValue ?? newMono;
          }
          if (newColor !== null && existingDevice.color_pages !== null && newColor < existingDevice.color_pages) {
            counterResets.push(`color: ${existingDevice.color_pages} → ${newColor}`);
            resetValue = resetValue ?? newColor;
          }

          await this.db("devices")
            .where("id", deviceId)
            .update({
              ip_address: ip || existingDevice.ip_address,
              serial_number: finalSerial,
              brand: (brand !== 'unknown' && brand !== 'generic') ? brand : existingDevice.brand,
              model: finalModel,
              name: finalName,
              last_seen: new Date(),
              active: true,
              total_pages: parseCount(r.total_pages) ?? existingDevice.total_pages,
              mono_pages: parseCount(r.mono_pages) ?? existingDevice.mono_pages,
              color_pages: parseCount(r.color_pages) ?? existingDevice.color_pages,
              poll_method: pollMethod || existingDevice.poll_method,
              toner_black: parseToner(r.toner_black) ?? existingDevice.toner_black,
              toner_cyan: parseToner(r.toner_cyan) ?? existingDevice.toner_cyan,
              toner_magenta: parseToner(r.toner_magenta) ?? existingDevice.toner_magenta,
              toner_yellow: parseToner(r.toner_yellow) ?? existingDevice.toner_yellow,
              cartridge_code_black: r.cartridge_code_black ?? existingDevice.cartridge_code_black,
              cartridge_code_cyan: r.cartridge_code_cyan ?? existingDevice.cartridge_code_cyan,
              cartridge_code_magenta: r.cartridge_code_magenta ?? existingDevice.cartridge_code_magenta,
              cartridge_code_yellow: r.cartridge_code_yellow ?? existingDevice.cartridge_code_yellow,
              cartridge_serial_black: r.cartridge_serial_black ?? existingDevice.cartridge_serial_black,
              cartridge_serial_cyan: r.cartridge_serial_cyan ?? existingDevice.cartridge_serial_cyan,
              cartridge_serial_magenta: r.cartridge_serial_magenta ?? existingDevice.cartridge_serial_magenta,
              cartridge_serial_yellow: r.cartridge_serial_yellow ?? existingDevice.cartridge_serial_yellow,
              firmware: (r.firmware && r.firmware.trim()) ? r.firmware.trim() : (existingDevice.firmware || null),
              mac: (r.mac && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(r.mac)) ? r.mac : (existingDevice.mac || null),
              hostname: (r.hostname && r.hostname.trim()) ? r.hostname.trim().slice(0, 100) : (existingDevice.hostname || null),
              location: (r.location && r.location.trim()) ? r.location.trim().slice(0, 255) : (existingDevice.location || null),
              sku: skuFrom(r.supplies_details) ?? existingDevice.sku ?? null,
              supplies_details: r.supplies_details
                ? JSON.stringify(mergeSuppliesDetails(
                    existingDevice.supplies_details ? (typeof existingDevice.supplies_details === 'string' ? JSON.parse(existingDevice.supplies_details) : existingDevice.supplies_details) : {},
                    r.supplies_details,
                  ))
                : existingDevice.supplies_details,
            });

          if (counterResets.length > 0) {
            const resetMsg = `Contador(es) con reset o decremento detectado: ${counterResets.join(', ')}`;
            const existingResetAlert = await this.db("alerts")
              .where({ device_id: deviceId, message: resetMsg, resolved: false })
              .first();
            if (!existingResetAlert) {
              await this.db("alerts").insert({
                device_id: deviceId,
                type: "counter_reset",
                severity: "critical",
                message: resetMsg,
                value: resetValue,
                resolved: false,
                created_at: new Date(),
              });
            }
          }
        } else {
          deviceId = crypto.randomUUID();
          await this.db("devices").insert({
            id: deviceId,
            agent_id: agentId,
            ip_address: ip || null,
            serial_number: serialToUse || null,
            name: (validHost || friendlyName).slice(0, 255),
            brand: brand.slice(0, 100),
            model: cleanModel.slice(0, 255),
            active: true,
            last_seen: new Date(),
            total_pages: parseCount(r.total_pages),
            mono_pages: parseCount(r.mono_pages),
            color_pages: parseCount(r.color_pages),
            poll_method: pollMethod,
            toner_black: parseToner(r.toner_black),
            toner_cyan: parseToner(r.toner_cyan),
            toner_magenta: parseToner(r.toner_magenta),
            toner_yellow: parseToner(r.toner_yellow),
            cartridge_code_black: r.cartridge_code_black ?? null,
            cartridge_code_cyan: r.cartridge_code_cyan ?? null,
            cartridge_code_magenta: r.cartridge_code_magenta ?? null,
            cartridge_code_yellow: r.cartridge_code_yellow ?? null,
            cartridge_serial_black: r.cartridge_serial_black ?? null,
            cartridge_serial_cyan: r.cartridge_serial_cyan ?? null,
            cartridge_serial_magenta: r.cartridge_serial_magenta ?? null,
            cartridge_serial_yellow: r.cartridge_serial_yellow ?? null,
            firmware: r.firmware ?? null,
            mac: (r.mac && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(r.mac)) ? r.mac : null,
            hostname: (r.hostname && r.hostname.trim()) ? r.hostname.trim().slice(0, 100) : null,
            location: (r.location && r.location.trim()) ? r.location.trim().slice(0, 255) : null,
            sku: skuFrom(r.supplies_details),
            supplies_details: r.supplies_details ? JSON.stringify(r.supplies_details) : null,
          });
        }

        // Sincronizar alertas activas provenientes de EWS si están presentes
        const suppliesObj = typeof r.supplies_details === 'string' ? JSON.parse(r.supplies_details) : r.supplies_details;
        if (suppliesObj?.alerts && Array.isArray(suppliesObj.alerts)) {
          for (const alertItem of suppliesObj.alerts) {
            if (alertItem.description || alertItem.code) {
              const alertMsg = alertItem.description || alertItem.code;
              const alertType = alertItem.code || 'EWS_ALERT';
              const sevLower = String(alertItem.severity || '').toLowerCase();
              const alertSev = (sevLower === 'critical' || sevLower === 'error' || sevLower === 'danger') ? 'critical' : 'warning';
              
              const existingAlert = await this.db("alerts")
                .where({ device_id: deviceId, message: alertMsg, resolved: false })
                .first();

              if (!existingAlert) {
                await this.db("alerts").insert({
                  device_id: deviceId,
                  type: alertType.slice(0, 50),
                  severity: alertSev,
                  message: alertMsg,
                  resolved: false,
                  created_at: new Date(),
                });
              }
            }
          }
        }

        // Purgar y consolidar cualquier otro registro fantasma duplicado en esta IP
        if (ip) {
          const ghostDeviceIds = await this.db("devices")
            .where({ agent_id: agentId, ip_address: ip })
            .whereNot("id", deviceId)
            .andWhere((b) => b.whereNull("serial_number").orWhere("serial_number", ip))
            .pluck("id");

          if (ghostDeviceIds.length > 0) {
            await this.db("readings").whereIn("device_id", ghostDeviceIds).update({ device_id: deviceId });
            await this.db("devices").whereIn("id", ghostDeviceIds).del();
          }
        }

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
          reading_id:   isValidUuid(r.reading_id) ? r.reading_id : null,
          time:         readingTime,
          device_id:    deviceId,
          total_pages:  parseCount(r.total_pages),
          mono_pages:   parseCount(r.mono_pages),
          color_pages:  parseCount(r.color_pages),
          toner_black:  parseToner(r.toner_black),
          toner_cyan:   parseToner(r.toner_cyan),
          toner_magenta: parseToner(r.toner_magenta),
          toner_yellow: parseToner(r.toner_yellow),
          supplies_details: r.supplies_details ? JSON.stringify(r.supplies_details) : null,
          offline:      r.offline ?? false,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.stack || err.message : String(err);
        console.error(`[SYNC] Error procesando dispositivo ${r.device_id}:`, errMsg);
        // Continuamos con el resto de la tanda para no bloquear todo el agente
        if (agentId) {
          await this.ingestLogs(agentId, [{
            time: new Date().toISOString(),
            level: 'ERROR',
            message: `Device Sync Fail [${r.ip || r.device_id}]: ${errMsg}`
          }]);
        }
      }
    }

    let inserted = 0;
    let duplicates = 0;

    if (mappedReadings.length > 0) {
      try {
        // Filtrar lecturas para asegurar que el device_id exista en la tabla devices
        const deviceIds = [...new Set(mappedReadings.map(m => m.device_id))];
        const existingDevices = await this.db("devices")
          .whereIn("id", deviceIds)
          .pluck("id");

        const validDeviceSet = new Set(existingDevices.map(String));
        const validReadings = mappedReadings.filter(m => validDeviceSet.has(String(m.device_id)));

        if (validReadings.length > 0) {
          // Inserción masiva de lecturas válidas en el historial.
          // ON CONFLICT (reading_id, time) DO NOTHING: idempotencia ante reintentos
          // del agente (mismo lote reenviado tras perder la respuesta del servidor).
          const insertedRows = await this.db("readings")
            .insert(validReadings)
            .onConflict(["reading_id", "time"])
            .ignore()
            .returning("reading_id");
          inserted = insertedRows.length;
          duplicates = validReadings.length - inserted;
        }
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
      const readingsQueue = new Queue("readings-queue", { connection: this.redis as any });
      await readingsQueue.add("evaluate-readings", { readings: mappedReadings });
    } catch (e: unknown) {
      console.error("[SYNC] BullMQ no disponible:", e);
    }

    // Actualizar también el heartbeat del agente al sincronizar
    await this.heartbeat(agentId);

    return { received: readings.length, inserted, duplicates };
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
    if (!agentId) return;
    const updateData: Record<string, any> = {
      last_seen: new Date(),
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

    await this.db("agents")
      .where({ id: agentId, status: "offline" })
      .update({ status: "active" });
  }

  async getConfig(agentId: string) {
    const agent = await this.db("agents")
      .where({ id: agentId })
      .select("ip_ranges", "snmp_community", "scan_interval_minutes", "toner_warning_threshold", "toner_critical_threshold", "scan_schedule")
      .first();
    
    if (agent) {
      if (typeof agent.ip_ranges === 'string') {
        agent.ip_ranges = JSON.parse(agent.ip_ranges);
      }
      if (typeof agent.scan_schedule === 'string') {
        agent.scan_schedule = JSON.parse(agent.scan_schedule);
      }
    }
    return agent;
  }

  /**
   * @param clientId - si viene (client_viewer), acota clientes y equipos al cliente
   *   del usuario. `null` = sin restricción (admin/operator, comportamiento actual).
   */
  async globalSearch(query: string, clientId: string | null = null) {
    const q = `%${query}%`;

    const [clients, devices] = await Promise.all([
      this.db("clients")
        .where("name", "ILIKE", q)
        .modify((b) => { if (clientId) b.andWhere("id", clientId); })
        .select("id", "name")
        .limit(5),
      this.db("devices")
        // Agrupado en un `.where(builder => ...)`: la versión anterior encadenaba
        // `.where(A).orWhere(B).orWhere(C).orWhere(D)` sin agrupar, así que CUALQUIER
        // `.where(client_id, cid)` agregado después de este bloque quedaba anulado por
        // precedencia de OR (`A OR B OR C OR (D AND client_id=cid)`) — una fuga entre
        // clientes que además parecía funcionar en pruebas manuales por serial exacto.
        .where((b) => {
          b.where("serial_number", "ILIKE", q)
            .orWhere("brand", "ILIKE", q)
            .orWhere("model", "ILIKE", q)
            .orWhere("name", "ILIKE", q);
        })
        .modify((b) => {
          if (clientId) {
            b.whereIn(
              "devices.id",
              this.db("devices")
                .whereIn("agent_id", this.db("agents").where("client_id", clientId).select("id"))
                .select("id")
            );
          }
        })
        .select("devices.id", "devices.serial_number", "devices.brand", "devices.model", "devices.name")
        .limit(5),
    ]);

    return { clients, devices };
  }
}
