import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";
import path from "path";
import Redis from "ioredis";
import knex from "knex";
import crypto from "crypto";

import knexConfig from "../db/knexfile";
import { AgentService } from "../services/agentService";
import "../jobs/heartbeatMonitor"; // Inicia el monitor de heartbeat al arrancar

dotenv.config({ path: path.join(__dirname, "../../../.env") });

// Falla explícito si JWT_SECRET no está configurado (no más fallback inseguro)
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET no está definido en .env");
  process.exit(1);
}

const fastify = Fastify({ logger: true });

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const agentService = new AgentService(db, redis);

// JWT de 30 días para agentes, 8 horas para portal (mismo secret, distinto payload)
const JWT_AGENT_TTL = "30d";
const JWT_PORTAL_TTL = "8h";

// ─── Helpers de autenticación ────────────────────────────────────────────────

async function agentAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const user = request.user as any;
    if (!user.agentId) {
      return reply.status(403).send({ error: "Token de portal no puede acceder a esta ruta" });
    }

    // Security fix: If there's an :id in the params, it MUST match the token's agentId
    const { id } = request.params as any;
    if (id && id !== user.agentId) {
      return reply.status(403).send({ error: "No tiene permisos para acceder a este agente" });
    }

    // Bug corregido: Verificar que el agente existe y está activo en la DB
    const agent = await db("agents").where({ id: user.agentId }).select("status").first();
    if (!agent || agent.status === "revoked") {
      return reply.status(404).send({ error: "Agente no encontrado o revocado" });
    }

    const blacklisted = await agentService.isBlacklisted(redis, user.agentId);
    if (blacklisted) {
      return reply.status(401).send({ error: "Token revocado" });
    }
  } catch {
    return reply.status(401).send({ error: "Token inválido o expirado" });
  }
}

async function portalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.cookies?.stc_session;
    if (!token) {
      return reply.status(401).send({ error: "No autenticado" });
    }
    const decoded = fastify.jwt.verify<{ role: string; userId: string }>(token);
    if (decoded.role !== "portal") {
      return reply.status(403).send({ error: "Token de agente no puede acceder a esta ruta" });
    }
    (request as any).user = decoded;
  } catch {
    return reply.status(401).send({ error: "Token inválido o expirado" });
  }
}

// ─── Schemas de validación ───────────────────────────────────────────────────

const activateSchema = {
  body: {
    type: "object",
    required: ["key"],
    properties: {
      key: { type: "string" },
      hardwareId: { type: "string" },
    },
  },
};

const refreshSchema = {
  body: {
    type: "object",
    required: ["agentId", "refresh_token"],
    properties: {
      agentId: { type: "string", format: "uuid" },
      refresh_token: { type: "string", minLength: 128, maxLength: 128 },
    },
  },
};

const portalLoginSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string" },
      password: { type: "string" },
    },
  },
};

const syncSchema = {
  body: {
    type: "object",
    required: ["readings"],
    properties: {
      readings: {
        type: "array",
        maxItems: 500,
        items: {
          type: "object",
          required: ["device_id", "time"],
          properties: {
            device_id:   { type: "string" },
            ip:          { type: "string", nullable: true },
            brand:       { type: "string", nullable: true },
            model:       { type: "string", nullable: true },
            time:        { type: "string" },
            total_pages: { type: ["integer", "number", "string"], nullable: true },
            mono_pages:  { type: ["integer", "number", "string"], nullable: true },
            color_pages: { type: ["integer", "number", "string"], nullable: true },
            toner_black: { type: ["integer", "number", "string"], nullable: true },
            toner_cyan:  { type: ["integer", "number", "string"], nullable: true },
            toner_magenta: { type: ["integer", "number", "string"], nullable: true },
            toner_yellow: { type: ["integer", "number", "string"], nullable: true },
            offline:     { type: "boolean" },
          },
        },
      },
    },
  },
};

const commandSchema = {
  body: {
    type: "object",
    required: ["type"],
    properties: {
      type: { type: "string", enum: ["FORCE_SCAN", "RESTART", "UPDATE_CONFIG", "PING"] },
      payload: { type: "object" },
    },
  },
};

const createClientSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      contact_name: { type: "string", maxLength: 100 },
      contact_email: { type: "string", format: "email" },
      contact_phone: { type: "string", maxLength: 50 },
    },
  },
};

const createAgentSchema = {
  body: {
    type: "object",
    required: ["clientId", "name"],
    properties: {
      clientId: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 100 },
      ip_ranges: {
        type: "array",
        items: {
          type: "object",
          required: ["start", "end"],
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
        },
      },
      snmp_community: { type: "string", maxLength: 64 },
      scan_interval_minutes: { type: "integer", minimum: 1, maximum: 1440 },
    },
  },
};

// ─── Startup ─────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // CORS: acepta portal desde Vercel, dominio propio y localhost (dev)
    const allowedOrigins = [
      process.env.PORTAL_ORIGIN,                 // URL de Vercel o dominio propio
      "http://localhost:5173",                    // dev portal
      "http://localhost:3000",                    // dev API
    ].filter(Boolean) as string[];

    await fastify.register(cors, {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    });

    // Security headers (Content-Security-Policy, X-Frame-Options, etc.)
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc:  ["'self'"],
          styleSrc:   ["'self'", "'unsafe-inline'"],
          imgSrc:     ["'self'", "data:"],
        },
      },
    });

    await fastify.register(cookie, {
      secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET!,
      hook: "onRequest",
      parseOptions: {},
    });

    await fastify.register(jwt, { secret: process.env.JWT_SECRET! });

    // Rate limiting global con Redis como store (para deploys multi-instancia)
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
      redis,
      keyGenerator: (request) =>
        (request.headers["x-forwarded-for"] as string) || request.ip,
    });

    // WebSocket (opcional — instalar con: npm install @fastify/websocket)
    try {
      const wsPlugin = require("@fastify/websocket");
      await fastify.register(wsPlugin);
      const { registerWebSocket } = await import("../ws/index");
      await registerWebSocket(fastify);
      fastify.log.info("WebSocket hub activo en /ws");
    } catch {
      fastify.log.warn("@fastify/websocket no instalado — WebSocket desactivado");
    }

    // ─── Rutas públicas ───────────────────────────────────────────────────────

    // Manejador para el health check de Render en la raíz
    fastify.get("/", async () => ({ status: "ok", service: "stc-cloud-api" }));
    fastify.get("/health", async () => ({ status: "ok", version: "1.0.0" }));

    // Evitar que el servidor crashee si Redis se desconecta temporalmente
    redis.on("error", (err) => {
      console.error("[Redis] Error de conexión:", err.message);
    });

    // Login del portal — genera JWT con role: 'portal'
    fastify.post("/api/v1/portal/login", {
      schema: portalLoginSchema,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    }, async (request, reply) => {
      const { username, password } = request.body as any;
      const adminUser = process.env.PORTAL_ADMIN_USER || "admin";
      const adminPass = process.env.PORTAL_ADMIN_PASSWORD;

      if (!adminPass) {
        return reply.status(503).send({ error: "PORTAL_ADMIN_PASSWORD no configurado en .env" });
      }
      if (username !== adminUser || password !== adminPass) {
        return reply.status(401).send({ error: "Credenciales inválidas" });
      }

      const token = fastify.jwt.sign(
        { role: "portal", userId: adminUser },
        { expiresIn: JWT_PORTAL_TTL }
      );
      reply.setCookie("stc_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        // 'none' required for cross-origin fetch (Vercel frontend → Render backend).
        // Falls back to 'lax' in dev (HTTP, where Secure is false and 'none' is invalid).
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      return { ok: true };
    });

    // Logout del portal — elimina la cookie de sesión
    fastify.post("/api/v1/portal/logout", async (_request, reply) => {
      reply.clearCookie("stc_session", { path: "/" });
      return { ok: true };
    });

    // Verificar sesión activa (usado por el frontend al cargar)
    fastify.get("/api/v1/portal/me", { preHandler: portalAuth }, async (request) => {
      const user = request.user as any;
      return { userId: user.userId, role: user.role };
    });

    // Activar agente con one-time key
    fastify.post("/api/v1/agents/activate", {
      schema: activateSchema,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    }, async (request, reply) => {
      const body = request.body as any;
      const key = body.key?.trim();
      const hardwareId = body.hardwareId?.trim() || "unknown";
      
      request.log.info(`[AUTH] Solicitud de activación recibida. Key: ${key?.substring(0, 8)}... HardwareId: ${hardwareId}`);

      try {
        if (!key) throw new Error("La clave de activacion es requerida");
        if (key.length !== 64) {
          console.warn(`[AUTH] Clave de activación con longitud inválida: ${key.length}`);
          throw new Error("La clave de activación debe tener exactamente 64 caracteres");
        }
        const result = await agentService.activateAgent(key, hardwareId);
        const token = fastify.jwt.sign(
          { agentId: result.agentId, jti: crypto.randomUUID() },
          { expiresIn: JWT_AGENT_TTL }
        );
        return {
          status: "success",
          agentId: result.agentId,
          token,
          refresh_token: result.refreshToken,
          config: { pollInterval: 30, heartbeatInterval: 60 },
        };
      } catch (err: any) {
        return reply.status(401).send({ error: err.message });
      }
    });

    // Renovar JWT del agente con refresh token
    fastify.post("/api/v1/agents/refresh", { schema: refreshSchema }, async (request, reply) => {
      const { agentId, refresh_token } = request.body as any;
      try {
        const result = await agentService.refreshAgentToken(agentId, refresh_token);
        const token = fastify.jwt.sign(
          { agentId: result.agentId, jti: crypto.randomUUID() },
          { expiresIn: JWT_AGENT_TTL }
        );
        return { status: "success", token, refresh_token: result.refreshToken };
      } catch (err: any) {
        return reply.status(401).send({ error: err.message });
      }
    });

    // ─── Rutas autenticadas — AGENTE ─────────────────────────────────────────

    fastify.get(
      "/api/v1/agents/:id/commands",
      { preHandler: agentAuth },
      async (request) => {
        const { id } = request.params as any;
        return await agentService.getPendingCommands(id);
      }
    );

    fastify.post(
      "/api/v1/agents/:id/heartbeat",
      { preHandler: agentAuth },
      async (request) => {
        const { id } = request.params as any;
        const { logs, commandResults } = request.body as any;

        // Heartbeat y actualización de last_seen
        await agentService.heartbeat(id);

        // Ingesta de logs si vienen en el heartbeat
        if (logs && Array.isArray(logs)) {
          await agentService.ingestLogs(id, logs);
        }

        // Procesar resultados de comandos ejecutados
        if (commandResults && Array.isArray(commandResults)) {
          for (const res of commandResults) {
            await agentService.updateCommandResult(res.id, res.status, res.result);
          }
        }

        const [config, commands] = await Promise.all([
          agentService.getConfig(id),
          agentService.getPendingCommands(id)
        ]);
        
        return { status: "received", config, commands };
      }
    );

    fastify.post(
      "/api/v1/devices/sync",
      { 
        preHandler: agentAuth, 
        schema: syncSchema,
        preValidation: async (request) => {
          // Log temporal para ver qué está mandando el agente y por qué falla la validación
          const body = request.body as any;
          if (body && body.readings) {
            // Eliminados logs ruidosos de sincronización masiva para producción
          }
        }
      },
      async (request, reply) => {
        const { readings } = request.body as any;
        const { agentId } = request.user as any;
        try {
          await agentService.syncReadings(redis, readings, agentId);
          return { status: "success", count: readings.length };
        } catch (e: any) {
          return reply.status(500).send({ error: e.message });
        }
      }
    );

    fastify.post(
      "/api/v1/devices/register",
      { preHandler: agentAuth },
      async (request) => {
        const { devices } = request.body as any;
        const { agentId } = request.user as any;
        await agentService.registerDevices(agentId, devices);
        return { status: "success" };
      }
    );

    // ─── Rutas autenticadas — PORTAL ─────────────────────────────────────────

    // Crear cliente
    fastify.post(
      "/api/v1/clients",
      { preHandler: portalAuth, schema: createClientSchema },
      async (request) => {
        const data = request.body as any;
        const [client] = await db("clients").insert(data).returning("*");
        return client;
      }
    );

    // Crear agente y generar activation key
    fastify.post(
      "/api/v1/agents",
      { preHandler: portalAuth, schema: createAgentSchema },
      async (request) => {
        const { clientId, name, ip_ranges, snmp_community, scan_interval_minutes } = request.body as any;
        return await agentService.createActivationKey(clientId, name, { ip_ranges, snmp_community, scan_interval_minutes });
      }
    );

    // Revocar agente (bug del análisis — faltaba el endpoint HTTP)
    fastify.post(
      "/api/v1/agents/:id/revoke",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        const requestIp = (request.headers["x-forwarded-for"] as string) || request.ip;
        // TTL = 30 días en segundos (duración máxima del access token)
        await agentService.revokeToken(redis, id, 30 * 24 * 60 * 60, requestIp);
        return { status: "revoked" };
      }
    );

    // Regenerar llave de activación para un agente existente
    fastify.post(
      "/api/v1/agents/:id/regenerate-key",
      { preHandler: portalAuth },
      async (request, reply) => {
        const { id } = request.params as any;
        try {
          const result = await agentService.regenerateActivationKey(id);
          return result;
        } catch (err: any) {
          return reply.status(404).send({ error: err.message });
        }
      }
    );

    // Enviar comando al agente (vía DB)
    fastify.post(
      "/api/v1/agents/:id/command",
      { preHandler: portalAuth, schema: commandSchema },
      async (request) => {
        const { id } = request.params as any;
        const { type, payload } = request.body as any;
        const command = await agentService.queueCommand(id, type, payload || {});
        return { status: "queued", commandId: command.id };
      }
    );

    // Obtener logs del agente para el portal
    fastify.get(
      "/api/v1/agents/:id/logs",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        const { limit } = request.query as any;
        return await agentService.getLogs(id, parseInt(limit) || 50);
      }
    );

    // Exportar logs a CSV
    fastify.get(
      "/api/v1/agents/:id/logs/export",
      { preHandler: portalAuth },
      async (request, reply) => {
        const { id } = request.params as any;
        const logs = await agentService.getLogs(id, 1000); // Exportar los últimos 1000
        
        let csv = "Timestamp;Level;Message\n";
        logs.forEach((l: any) => {
          const time = new Date(l.time).toLocaleString('es-AR');
          csv += `${time};${l.level};${l.message}\n`;
        });

        reply
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", `attachment; filename=logs_agent_${id}.csv`)
          .send(csv);
      }
    );

    // Leer configuración del agente (ip_ranges, snmp_community, scan_interval_minutes)
    fastify.get(
      "/api/v1/agents/:id/config",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        return await agentService.getConfig(id);
      }
    );

    // Actualizar configuración del agente (ip_ranges, snmp_community)
    fastify.put(
      "/api/v1/agents/:id/config",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        return await agentService.updateConfig(id, request.body);
      }
    );

    // Detalle de un monitor (agente) con conteos y datos del cliente
    fastify.get(
      "/api/v1/agents/:id",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        const agent = await db("agents")
          .where("agents.id", id)
          .select(
            "agents.*",
            "clients.name as client_name",
            "clients.id as client_id",
            db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS active_device_count"),
            db.raw("COUNT(DISTINCT d.id)::int AS total_device_count")
          )
          .leftJoin("clients", "clients.id", "agents.client_id")
          .leftJoin("devices as d", "d.agent_id", "agents.id")
          .groupBy("agents.id", "clients.name", "clients.id")
          .first();
        if (!agent) return { error: "Monitor no encontrado" };
        return agent;
      }
    );

    // Dispositivos de un monitor
    fastify.get(
      "/api/v1/agents/:id/devices",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        return await db("devices")
          .where("agent_id", id)
          .select("*")
          .orderBy("brand");
      }
    );

    // Lista de agentes (portal) con nombre de cliente
    fastify.get(
      "/api/v1/agents",
      { preHandler: portalAuth },
      async () =>
        await db("agents")
          .join("clients", "agents.client_id", "clients.id")
          .select(
            "agents.id",
            "agents.name",
            "agents.hardware_id",
            "agents.status",
            "agents.last_seen",
            "agents.client_id",
            "agents.created_at",
            "clients.name as client_name"
          )
          .orderBy("agents.created_at", "desc")
    );

    // Eliminar monitor (agente)
    fastify.delete(
      "/api/v1/agents/:id",
      { preHandler: portalAuth },
      async (request, reply) => {
        const { id } = request.params as any;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
          return reply.status(400).send({ error: "ID de agente inválido" });
        }
        try {
          fastify.log.info({ agentId: id }, "Solicitud de eliminación de agente y cascada");
          
          // Eliminación manual en cascada (para asegurar integridad si no hay FK Cascade en DB)
          await db.transaction(async (trx) => {
            const devices = await trx("devices").where("agent_id", id).select("id");
            const deviceIds = devices.map(d => d.id);
            
            if (deviceIds.length > 0) {
              await trx("readings").whereIn("device_id", deviceIds).delete();
              await trx("devices").where("agent_id", id).delete();
            }
            
            await trx("agents").where("id", id).delete();
          });

          return { status: "deleted" };
        } catch (err: any) {
          fastify.log.error(err, "Error al eliminar agente");
          return reply.status(500).send({ error: "Internal Server Error", details: err.message });
        }
      }
    );

    // Lista de clientes con conteos agregados
    fastify.get(
      "/api/v1/clients",
      { preHandler: portalAuth },
      async () =>
        await db("clients")
          .select(
            "clients.*",
            db.raw("COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"),
            db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS device_count")
          )
          .leftJoin("agents as a", "a.client_id", "clients.id")
          .leftJoin("devices as d", "d.agent_id", "a.id")
          .groupBy("clients.id")
          .orderBy("clients.name")
    );

    // Cliente por ID con conteos
    fastify.get(
      "/api/v1/clients/:id",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        return await db("clients")
          .where("clients.id", id)
          .select(
            "clients.*",
            db.raw("COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"),
            db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS device_count")
          )
          .leftJoin("agents as a", "a.client_id", "clients.id")
          .leftJoin("devices as d", "d.agent_id", "a.id")
          .groupBy("clients.id")
          .first();
      }
    );

    // Monitores de un cliente con conteo de dispositivos
    fastify.get(
      "/api/v1/clients/:id/monitors",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        return await db("agents")
          .where("agents.client_id", id)
          .select(
            "agents.id", "agents.name", "agents.status", "agents.last_seen",
            "agents.hardware_id", "agents.ip_ranges", "agents.scan_interval_minutes",
            db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS device_count")
          )
          .leftJoin("devices as d", "d.agent_id", "agents.id")
          .groupBy("agents.id")
          .orderBy("agents.name");
      }
    );

    // Uso mensual del cliente para gráfico (últimos 4 meses)
    fastify.get(
      "/api/v1/clients/:id/usage",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        const result = await db.raw(`
          SELECT 
            to_char(month_date, 'Mon YYYY') AS month,
            month_date,
            SUM(max_mono - min_mono)::int as mono,
            SUM(max_color - min_color)::int as color
          FROM (
            SELECT 
              date_trunc('month', r.time) as month_date,
              r.device_id,
              MAX(r.mono_pages) as max_mono,
              MIN(r.mono_pages) as min_mono,
              MAX(r.color_pages) as max_color,
              MIN(r.color_pages) as min_color
            FROM readings r
            JOIN devices d ON r.device_id = d.id
            JOIN agents  a ON d.agent_id = a.id
            WHERE a.client_id = ?
              AND r.time >= date_trunc('month', NOW() - INTERVAL '4 months')
            GROUP BY date_trunc('month', r.time), r.device_id
          ) sub
          GROUP BY month_date
          ORDER BY month_date ASC
        `, [id]);
        return result.rows;
      }
    );

    // Todos los dispositivos (inventario global)
    fastify.get(
      "/api/v1/devices",
      { preHandler: portalAuth },
      async () =>
        await db("devices")
          .join("agents", "devices.agent_id", "agents.id")
          .join("clients", "agents.client_id", "clients.id")
          .where("devices.active", true)
          .select(
            "devices.*",
            db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
            "agents.name as monitor_name",
            "clients.name as client_name"
          )
          .orderBy("clients.name")
    );

    // Detalle de un dispositivo específico
    fastify.get(
      "/api/v1/devices/:id",
      { preHandler: portalAuth },
      async (request, reply) => {
        const { id } = request.params as any;
        const device = await db("devices")
          .where("devices.id", id)
          .select(
            "devices.*",
            db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
            "agents.name as monitor_name",
            "clients.name as client_name"
          )
          .join("agents", "agents.id", "devices.agent_id")
          .join("clients", "clients.id", "agents.client_id")
          .first();
        if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
        return device;
      }
    );

    // Dispositivos de un cliente (JOIN agents)
    fastify.get(
      "/api/v1/clients/:id/devices",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        return await db("devices")
          .join("agents", "devices.agent_id", "agents.id")
          .where("agents.client_id", id)
          .select(
            "devices.*",
            db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
            "agents.name as monitor_name",
            "agents.last_seen as monitor_last_seen"
          )
          .orderBy("devices.brand");
      }
    );

    // Serie temporal de contadores — nuevo endpoint (faltaba en el análisis)
    fastify.get(
      "/api/v1/devices/:id/readings",
      { preHandler: portalAuth },
      async (request) => {
        const { id } = request.params as any;
        const { from, to, limit } = request.query as any;

        const query = db("readings")
          .where({ device_id: id })
          .orderBy("time", "desc")
          .limit(Math.min(Number(limit) || 500, 5000));

        if (from) query.where("time", ">=", new Date(from));
        if (to) query.where("time", "<=", new Date(to));

        return await query.select(
          "*",
          db.raw("CASE WHEN offline = true AND total_pages IS NULL THEN 'offline' ELSE 'online' END as status")
        );
      }
    );

    // Búsqueda global (Clientes, Dispositivos por Serie/Modelo)
    fastify.get(
      "/api/v1/search",
      { preHandler: portalAuth },
      async (request) => {
        const { q } = request.query as any;
        if (!q || q.length < 2) return { clients: [], devices: [] };
        return await agentService.globalSearch(q);
      }
    );

    // Alertas activas (portal)
    fastify.get("/api/v1/alerts", { preHandler: portalAuth }, async (request) => {
      const { resolved } = request.query as any;
      const query = db("alerts")
        .join("devices", "alerts.device_id", "devices.id")
        .select(
          "alerts.*",
          "devices.brand",
          "devices.ip_address",
          "devices.name as device_name",
        )
        .orderBy("alerts.created_at", "desc")
        .limit(200);

      if (resolved === "true") {
        query.where("alerts.resolved", true);
      } else {
        query.where("alerts.resolved", false);
      }

      return await query;
    });

    // Dashboard Estratégico (Portal Global)
    fastify.get("/api/v1/dashboard", { preHandler: portalAuth }, async () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);

      const [
        devicesCount,
        agentsStats,
        clientsCount,
        monthlyVolume,
        topClients,
        brandStats,
        offlineAgents
      ] = await Promise.all([
        // Total dispositivos activos
        db("devices").where({ active: true }).count("* as c").first(),
        
        // Stats de agentes (Online vs Total)
        db("agents")
          .select(
            db.raw("COUNT(*)::int as total"),
            db.raw("COUNT(CASE WHEN last_seen >= ? THEN 1 END)::int as online", [fiveMinsAgo])
          )
          .first(),

        // Total clientes
        db("clients").count("* as c").first(),

        // Volumen del mes actual (Delta Real: SUM(MAX - MIN) por dispositivo)
        db.raw(`
          SELECT SUM(delta)::bigint as total FROM (
            SELECT (MAX(total_pages) - MIN(total_pages)) as delta
            FROM readings
            WHERE time >= date_trunc('month', now())
            GROUP BY device_id
          ) sub
        `).then(r => r.rows[0]),

        // Top 5 clientes por cantidad de dispositivos
        db("clients")
          .select("clients.name", "clients.id")
          .count("devices.id as device_count")
          .leftJoin("agents", "agents.client_id", "clients.id")
          .leftJoin("devices", "devices.agent_id", "agents.id")
          .groupBy("clients.id", "clients.name")
          .orderBy("device_count", "desc")
          .limit(5),

        // Distribución por marca
        db("devices")
          .where({ active: true })
          .select("brand")
          .count("* as count")
          .groupBy("brand")
          .orderBy("count", "desc")
          .limit(5),

        // Agentes offline o pendientes con nombre de cliente
        db("agents")
          .join("clients", "agents.client_id", "clients.id")
          .where((builder) => {
            builder.where("agents.last_seen", "<", fiveMinsAgo)
                   .orWhereNull("agents.last_seen")
                   .orWhere("agents.status", "offline");
          })
          .whereNot("agents.status", "revoked")
          .select("agents.id", "agents.name", "clients.name as client_name", "agents.last_seen")
          .orderBy("agents.last_seen", "desc")
          .limit(10),

        // ÚLTIMA LECTURA PROCESADA
        db("readings").orderBy("time", "desc").select("time").first()
      ]);

      return {
        stats: {
          devices: Number(devicesCount?.c || 0),
          agents: {
            total: agentsStats?.total || 0,
            online: agentsStats?.online || 0
          },
          clients: Number(clientsCount?.c || 0),
          volume: Number(monthlyVolume?.total || 0)
        },
        topClients: topClients.map((c: any) => ({ ...c, device_count: Number(c.device_count) })),
        brands: brandStats.map((b: any) => ({ ...b, count: Number(b.count) })),
        offlineAgents,
        systemHealth: {
          status: 'healthy',
          uptime: process.uptime(),
          lastSync: brandStats.length > 0 ? (await db("readings").orderBy("time", "desc").select("time").first())?.time : null
        }
      };
    });

    // ─── Start ────────────────────────────────────────────────────────────────

    const port = Number(process.env.PORT) || 3000;
    await fastify.listen({ port, host: "0.0.0.0" });
    fastify.log.info(`Servidor listo en http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
