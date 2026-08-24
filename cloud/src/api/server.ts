import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import Redis from "ioredis";
import { Queue } from "bullmq";
import knex from "knex";

import knexConfig from "../db/knexfile";
import { AgentService } from "../modules/agents";
import "../jobs/heartbeatMonitor";
import "../jobs/alertWorker";
import "../jobs/notificationWorker";
import "../jobs/reportDeliveryWorker";
import "../jobs/retentionJob";
import "../jobs/publicWebhookWorker";
import "../jobs/incidentWorker";
import "../jobs/scheduledReportsWorker";
import "../jobs/supplyRequestWorker";
import "../jobs/remoteActionWorker";
import { initSentry, captureError } from "../modules/observability/sentry";
import { registerMetricsRoutes } from "../modules/metrics/http-metrics";
import { setQueueDepthProvider } from "../modules/metrics/registry";

// Sentry lo más temprano posible (no-op sin SENTRY_DSN) — Fase 5.2.
initSentry();
import { registerWebSocket } from "../ws/index";

import { createAuthMiddleware } from "./middlewares/authMiddleware";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerAgentRoutes } from "../modules/agents/presentation/agent-routes";
import { registerPortalAgentRoutes } from "../modules/agents/presentation/portal-agent-routes";
import { registerClientRoutes } from "../modules/clients/presentation/client-routes";
import { registerPublicApiRoutes } from "./routes/publicApiRoutes";
import { registerDeviceRoutes } from "../modules/devices/presentation/device-routes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";
import { registerFeedbackRoutes } from "../modules/feedback/presentation/feedback-routes";
import { registerScheduledReportRoutes } from "../modules/scheduled-reports/presentation/scheduled-report-routes";
import { registerSupplyRequestRoutes } from "../modules/supply-requests/presentation/supply-request-routes";
import { registerMessageTemplateRoutes } from "../modules/message-templates/presentation/template-routes";
import { registerEmailLogRoutes } from "../modules/email-log/presentation/email-log-routes";
import { registerDeviceCostsRoutes } from "../modules/device-costs";
import { registerRemoteActionRoutes } from "../modules/remote-actions/presentation/remote-action-routes";
import { registerSystemSettingsRoutes } from "../modules/system-settings/presentation/system-settings-routes";
import { registerTwoFactorRoutes } from "../modules/two-factor/presentation/two-factor-routes";
import { registerReportRoutes } from "../modules/reports/presentation/report-routes";
import { registerAuditRoutes } from "../modules/audit/presentation/audit-routes";
import { registerAlertRoutes } from "../modules/alerts/presentation/alert-routes";
import { registerInventoryRoutes } from "../modules/inventory/presentation/inventory-routes";
import { registerSuppliesRoutes } from "./routes/suppliesRoutes";
import { registerIncidentRoutes } from "./routes/incidentRoutes";
import { getClientIp } from "./utils/ip";
import { SERVER_VERSION } from "../version";
import { CLIENT_VIEWER_ROUTES } from "./policy/rolePolicy";
import { isEncryptionConfigured } from "../services/cryptoService";
import { logger } from "../logger";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

if (!process.env.JWT_SECRET) {
  logger.error("FATAL: JWT_SECRET no está definido en .env");
  process.exit(1);
}

// A diferencia de JWT_SECRET, esto NO aborta el arranque: SNMP_CREDENTIALS_KEY
// sólo hace falta para instalaciones que configuren credenciales SNMPv3 (la
// mayoría no lo hará nunca) — abortar el boot por una env var opcional
// convertiría una feature opcional en un requisito de deploy. Guardar/leer
// credenciales sin la clave falla con un 503 explícito en el endpoint, no acá.
if (!isEncryptionConfigured()) {
  logger.warn(
    "[BOOT] SNMP_CREDENTIALS_KEY no definida — no se podrán guardar credenciales SNMPv3 nuevas " +
      "(reordenar/renombrar/borrar entradas ya guardadas no la requiere)."
  );
}

const fastify = Fastify({
  // Instancia propia (no la de `../logger`, ver ahí el porqué): `loggerInstance`
  // rompe la inferencia de tipos de Fastify a través de las funciones
  // `registerXRoutes(fastify: FastifyInstance)`. Mismo nivel via LOG_LEVEL para
  // que los logs de request y los de boot/workers queden consistentes igual.
  logger: { level: process.env.LOG_LEVEL || "info" },
  connectionTimeout: 0,
  // Confía en el proxy inmediato (nginx en el compose propio, el edge de Render en
  // producción) para resolver request.ip correctamente a partir de X-Forwarded-For.
  trustProxy: true,
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
  logger.error({ err: err.message }, "[Redis] Error de conexión");
});

// Cliente dedicado para @fastify/rate-limit: enableOfflineQueue:false hace que
// sus comandos fallen rápido si Redis no está disponible, en vez de quedar en
// cola esperando reconexión — lo que colgaría CUALQUIER request (no sólo
// /health), ya que el rate-limiter corre sobre casi todas las rutas. No se usa
// el cliente `redis` compartido para esto: blacklist, WS y BullMQ sí quieren
// esperar/reintentar, el rate-limiter no.
const rateLimitRedis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  enableOfflineQueue: false,
});

rateLimitRedis.on("error", (err) => {
  logger.error({ err: err.message }, "[Redis:rate-limit] Error de conexión");
});

const start = async () => {
  try {
    // ─── Migraciones ──────────────────────────────────────────────────────────

    logger.info("[DB] Verificando y ejecutando migraciones...");

    try {
      const hasTable = await db.schema.hasTable("knex_migrations");
      if (hasTable) {
        const isTS = __filename.endsWith(".ts");
        if (isTS) {
          await db.raw(
            `UPDATE knex_migrations SET name = REPLACE(name, '.js', '.ts') WHERE name LIKE '%.js'`
          );
          logger.info("[DB] Normalizadas migraciones a .ts para ejecución de desarrollo.");
        } else {
          await db.raw(
            `UPDATE knex_migrations SET name = REPLACE(name, '.ts', '.js') WHERE name LIKE '%.ts'`
          );
          logger.info("[DB] Normalizadas migraciones a .js para ejecución de producción/compilada.");
        }
      }
    } catch {
      logger.warn("[DB] No se pudo normalizar knex_migrations (posiblemente primera ejecución)");
    }

    try {
      const fs = require("fs");
      const migDir = path.join(__dirname, "../db/migrations");
      logger.info(`[DB] Directorio de migraciones: ${migDir}`);
      if (fs.existsSync(migDir)) {
        const files = fs.readdirSync(migDir);
        logger.info(`[DB] Archivos encontrados: ${files.join(", ")}`);
      } else {
        logger.error(`[DB] ERROR: El directorio de migraciones NO existe: ${migDir}`);
      }
    } catch {}

    try {
      const applied = await db("knex_migrations").select("name");
      logger.info(`[DB] Migraciones en DB: ${applied.map((m: { name: string }) => m.name).join(", ")}`);
    } catch {}

    await db.migrate.latest({
      directory: path.join(__dirname, "../db/migrations"),
      loadExtensions: __filename.endsWith(".ts") ? [".ts", ".js"] : [".js"],
    });
    logger.info("[DB] Migraciones al día.");

    // Bootstrapping: Auto-inicializar primer administrador si la tabla 'users' está vacía
    try {
      const { hashPassword } = require("./utils/password");
      const usersCount = await db("users").count("id as count").first();
      const count = parseInt((usersCount?.count as string) || "0", 10);
      if (count === 0) {
        logger.info("[DB] Inicializando usuario administrador por defecto...");
        const adminUser = (process.env.PORTAL_ADMIN_USER || "admin").toLowerCase();
        const adminPass = process.env.PORTAL_ADMIN_PASSWORD || "stc123456";
        await db("users").insert({
          id: db.raw("gen_random_uuid()"),
          username: adminUser,
          password_hash: hashPassword(adminPass),
          role: "admin",
          active: true,
        });
        logger.info(`[DB] Usuario administrador '${adminUser}' inicializado con éxito.`);
      }
    } catch (bootErr: unknown) {
      const errMsg = bootErr instanceof Error ? bootErr.message : String(bootErr);
      logger.error({ err: errMsg }, "[DB] Error al inicializar administrador");
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

    // Fase 5.1: /metrics + histogramas HTTP. Registrado ANTES del rate limit
    // para que el scraper de Prometheus no compita por el presupuesto por IP.
    registerMetricsRoutes(fastify);
    // Las colas reales del sistema. Conexión propia con los requisitos de
    // BullMQ (maxRetriesPerRequest: null) — no se reusa rateLimitRedis, que
    // tiene enableOfflineQueue:false a propósito para otro fin.
    const metricsRedis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      retryStrategy() { return 10000; },
    });
    const QUEUE_NAMES = ["readings-queue", "notifications-queue", "report-delivery-queue", "public-api-readings-queue"];
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const metricQueues = QUEUE_NAMES.map((name) => new Queue(name, { connection: metricsRedis as any }));
    setQueueDepthProvider(async () => {
      const depths: Record<string, number> = {};
      for (const q of metricQueues) {
        const counts = await q.getJobCounts("waiting");
        depths[q.name] = counts.waiting ?? 0;
      }
      return depths;
    });
    // Fase 5.2: los errores no manejados de handlers van a Sentry (además del
    // comportamiento default de Fastify, que se preserva re-lanzando).
    fastify.setErrorHandler((err, request, reply) => {
      captureError(err, { route: request.url, method: request.method });
      throw err;
    });

    await fastify.register(rateLimit, {
      // Configurable por env: la suite de tests e2e (27 archivos, algunos con
      // >100 requests/min por sí solos, ej. rbac.test.ts) pisaba el techo fijo
      // y producía 429 falsos. En producción el default sigue siendo 100.
      max: Number(process.env.RATE_LIMIT_MAX) || 100,
      timeWindow: "1 minute",
      redis: rateLimitRedis,
      // Si Redis no responde, no bloquear todas las requests con 500 — el
      // rate-limiting es una protección adicional, no debe tumbar la API.
      skipOnError: true,
      keyGenerator: (request: FastifyRequest) => getClientIp(request),
      allowList: (request: FastifyRequest) =>
        request.url.startsWith("/ws") ||
        request.url === "/health" ||
        request.url === "/api/v1/health",
    });

    try {
      const wsPlugin = require("@fastify/websocket");
      await fastify.register(wsPlugin);
      await registerWebSocket(fastify, db, redis, agentService);
      fastify.log.info("WebSocket hub activo en /ws");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Error cargando @fastify/websocket: ${errMsg}`);
      fastify.log.warn(
        "@fastify/websocket no instalado o falló la carga — WebSocket desactivado"
      );
    }

    // ─── Health checks ────────────────────────────────────────────────────────

    fastify.get("/", async () => ({ status: "ok", service: "stc-cloud-api" }));

    // ioredis reintenta indefinidamente y encola comandos mientras está
    // desconectado: sin un timeout propio, `redis.ping()` puede colgarse en
    // vez de fallar rápido si Redis está caído. Mismo criterio para Postgres,
    // por consistencia.
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
      ]);

    const healthHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
      const checks: Record<string, "ok" | "error"> = { database: "ok", redis: "ok" };
      let healthy = true;

      try {
        await withTimeout(db.raw("SELECT 1"), 3000);
      } catch {
        checks.database = "error";
        healthy = false;
      }

      try {
        await withTimeout(redis.ping(), 3000);
      } catch {
        checks.redis = "error";
        healthy = false;
      }

      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? "ok" : "degraded",
        version: SERVER_VERSION,
        checks,
      });
    };

    fastify.get("/health", healthHandler);
    fastify.get("/api/v1/health", healthHandler);

    // ─── Agent Installer Public Download Endpoint ─────────────────────────────
    fastify.get("/api/v1/agents/download-installer", async (request, reply) => {
      // Redirigimos al asset en el último release de GitHub para evitar binarios pesados en el repo
      reply.redirect("https://github.com/ivmartinez-cd/STC-cloud/releases/latest/download/Instalador-STC-Monitor.exe");
    });

    // ─── Auth middleware ──────────────────────────────────────────────────────

    const { agentAuth, portalAuth, apiKeyAuth } = createAuthMiddleware(fastify, db, redis, agentService);

    // Recolecta toda ruta declarada (método + url) a medida que se registra, para
    // validar contra la allowlist de RBAC apenas termine el registro — ver abajo.
    const declaredRoutes = new Set<string>();
    fastify.addHook("onRoute", (routeOptions) => {
      const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
      for (const method of methods) {
        declaredRoutes.add(`${method} ${routeOptions.url}`);
      }
    });

    // ─── Rutas ────────────────────────────────────────────────────────────────

    registerAuthRoutes(fastify, db, redis, agentService, agentAuth, portalAuth);
    registerAgentRoutes(fastify, redis, agentService, agentAuth);
    registerPortalAgentRoutes(fastify, db, redis, agentService, portalAuth);
    registerClientRoutes(fastify, db, portalAuth);
    registerDeviceRoutes(fastify, db, portalAuth);
    registerDashboardRoutes(fastify, db, agentService, portalAuth, redis);
    registerAlertRoutes(fastify, db, portalAuth);
    registerFeedbackRoutes(fastify, db, portalAuth);
    registerScheduledReportRoutes(fastify, db, portalAuth);
    registerSupplyRequestRoutes(fastify, db, portalAuth);
    registerMessageTemplateRoutes(fastify, db, portalAuth);
    registerEmailLogRoutes(fastify, db, portalAuth);
    registerDeviceCostsRoutes(fastify, db, portalAuth);
    registerRemoteActionRoutes(fastify, db, portalAuth);
    registerTwoFactorRoutes(fastify, db, portalAuth);
    registerReportRoutes(fastify, db, portalAuth);
    registerAuditRoutes(fastify, db, portalAuth);
    registerInventoryRoutes(fastify, db, portalAuth);
    registerSuppliesRoutes(fastify, db, portalAuth);
    registerIncidentRoutes(fastify, db, portalAuth);
    registerPublicApiRoutes(fastify, db, apiKeyAuth);
    registerSystemSettingsRoutes(fastify, db, portalAuth);

    // Assert de arranque: si una entrada de CLIENT_VIEWER_ROUTES no corresponde a
    // ninguna ruta real (typo, ruta renombrada), esto sería una denegación SILENCIOSA
    // en producción — indistinguible de "el rol no tiene acceso". Mejor abortar el
    // arranque y que se note de inmediato.
    const missingFromAllowlist = [...CLIENT_VIEWER_ROUTES].filter((r) => !declaredRoutes.has(r));
    if (missingFromAllowlist.length > 0) {
      fastify.log.error(
        `RBAC: rutas en CLIENT_VIEWER_ROUTES sin ruta real registrada: ${missingFromAllowlist.join(", ")}`
      );
      process.exit(1);
    }

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
