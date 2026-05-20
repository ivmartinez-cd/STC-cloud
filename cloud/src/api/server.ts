import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";
import path from "path";
import Redis from "ioredis";
import knex from "knex";

import knexConfig from "../db/knexfile";
import { AgentService } from "../services/agentService";
import "../jobs/heartbeatMonitor";
import "../jobs/alertWorker";
import { registerWebSocket } from "../ws/index";

import { createAuthMiddleware } from "./middlewares/authMiddleware";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerAgentRoutes } from "./routes/agentRoutes";
import { registerPortalAgentRoutes } from "./routes/portalAgentRoutes";
import { registerClientRoutes } from "./routes/clientRoutes";
import { registerDeviceRoutes } from "./routes/deviceRoutes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET no está definido en .env");
  process.exit(1);
}

const fastify = Fastify({
  logger: true,
  connectionTimeout: 0,
});

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Retry every 10 seconds to prevent event loop flood when Redis is offline
    return 10000;
  }
});
const agentService = new AgentService(db, redis);

redis.on("error", (err) => {
  console.error("[Redis] Error de conexión:", err.message);
});

const start = async () => {
  try {
    // ─── Migraciones ──────────────────────────────────────────────────────────

    console.log("[DB] Verificando y ejecutando migraciones...");

    try {
      const hasTable = await db.schema.hasTable("knex_migrations");
      if (hasTable) {
        const isTS = __filename.endsWith(".ts");
        if (isTS) {
          await db.raw(
            `UPDATE knex_migrations SET name = REPLACE(name, '.js', '.ts') WHERE name LIKE '%.js'`
          );
          console.log("[DB] Normalizadas migraciones a .ts para ejecución de desarrollo.");
        } else {
          await db.raw(
            `UPDATE knex_migrations SET name = REPLACE(name, '.ts', '.js') WHERE name LIKE '%.ts'`
          );
          console.log("[DB] Normalizadas migraciones a .js para ejecución de producción/compilada.");
        }
      }
    } catch {
      console.warn("[DB] No se pudo normalizar knex_migrations (posiblemente primera ejecución)");
    }

    try {
      const fs = require("fs");
      const migDir = path.join(__dirname, "../db/migrations");
      console.log(`[DB] Directorio de migraciones: ${migDir}`);
      if (fs.existsSync(migDir)) {
        const files = fs.readdirSync(migDir);
        console.log(`[DB] Archivos encontrados: ${files.join(", ")}`);
      } else {
        console.error(`[DB] ERROR: El directorio de migraciones NO existe: ${migDir}`);
      }
    } catch {}

    try {
      const applied = await db("knex_migrations").select("name");
      console.log(`[DB] Migraciones en DB: ${applied.map((m: any) => m.name).join(", ")}`);
    } catch {}

    await db.migrate.latest({
      directory: path.join(__dirname, "../db/migrations"),
      loadExtensions: process.env.NODE_ENV === "production" ? [".js"] : [".js", ".ts"],
    });
    console.log("[DB] Migraciones al día.");

    // Bootstrapping: Auto-inicializar primer administrador si la tabla 'users' está vacía
    try {
      const { hashPassword } = require("./utils/password");
      const usersCount = await db("users").count("id as count").first();
      const count = parseInt((usersCount?.count as string) || "0", 10);
      if (count === 0) {
        console.log("[DB] Inicializando usuario administrador por defecto...");
        const adminUser = (process.env.PORTAL_ADMIN_USER || "admin").toLowerCase();
        const adminPass = process.env.PORTAL_ADMIN_PASSWORD || "stc123456";
        await db("users").insert({
          id: db.raw("gen_random_uuid()"),
          username: adminUser,
          password_hash: hashPassword(adminPass),
          role: "admin",
          active: true,
        });
        console.log(`[DB] Usuario administrador '${adminUser}' inicializado con éxito.`);
      }
    } catch (bootErr: any) {
      console.error("[DB] Error al inicializar administrador:", bootErr.message);
    }

    // ─── Plugins ──────────────────────────────────────────────────────────────

    const allowedOrigins = [
      process.env.PORTAL_ORIGIN,
      "http://localhost:5173",
      "http://localhost:3000",
    ].filter(Boolean) as string[];

    await fastify.register(cors, {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
    });

    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    });

    await fastify.register(cookie, {
      secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET!,
      hook: "onRequest",
      parseOptions: {},
    });

    await fastify.register(jwt, { secret: process.env.JWT_SECRET! });

    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
      redis,
      keyGenerator: (request: any) =>
        (request.headers["x-forwarded-for"] as string) || request.ip,
      allowList: (request: any) => request.url.startsWith("/ws"),
    });

    try {
      const wsPlugin = require("@fastify/websocket");
      await fastify.register(wsPlugin);
      await registerWebSocket(fastify, agentService);
      fastify.log.info("WebSocket hub activo en /ws");
    } catch (err: any) {
      fastify.log.error(`Error cargando @fastify/websocket: ${err.message}`);
      fastify.log.warn(
        "@fastify/websocket no instalado o falló la carga — WebSocket desactivado"
      );
    }

    // ─── Health checks ────────────────────────────────────────────────────────

    fastify.get("/", async () => ({ status: "ok", service: "stc-cloud-api" }));
    fastify.get("/health", async () => ({ status: "ok", version: "1.0.0" }));
    fastify.get("/api/v1/health", async () => ({ status: "ok", version: "1.0.0" }));

    // ─── Auth middleware ──────────────────────────────────────────────────────

    const { agentAuth, portalAuth } = createAuthMiddleware(fastify, db, redis, agentService);

    // ─── Rutas ────────────────────────────────────────────────────────────────

    registerAuthRoutes(fastify, db, agentService, agentAuth, portalAuth);
    registerAgentRoutes(fastify, redis, agentService, agentAuth);
    registerPortalAgentRoutes(fastify, db, redis, agentService, portalAuth);
    registerClientRoutes(fastify, db, portalAuth);
    registerDeviceRoutes(fastify, db, portalAuth);
    registerDashboardRoutes(fastify, db, agentService, portalAuth);

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
