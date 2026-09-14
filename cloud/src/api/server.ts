import Fastify, { type FastifyServerOptions } from "fastify";
import dotenv from "dotenv";
import path from "path";
import Redis from "ioredis";
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
import "../jobs/alertDigestJob";
import { initSentry } from "../modules/observability/sentry";

// Sentry lo más temprano posible (no-op sin SENTRY_DSN) — Fase 5.2.
initSentry();

import { createAuthMiddleware } from "./middlewares/authMiddleware";
import { normalizeMigrationExtensions, bootstrapDefaultAdmin } from "./bootstrap";
import {
  registerBasePlugins, registerMetrics, registerErrorHandler, registerRateLimit, registerWebSocketPlugin,
} from "./plugins";
import { registerHealthRoutes } from "./health";
import { registerAllRoutes } from "./routes";
import { logMigrationDiagnostics, registerGracefulShutdown } from "./lifecycle";
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

// Tipado explícito: con `trustProxy` numérico la inferencia de Fastify elegía
// la sobrecarga HTTP/2 y rompía los `registerXRoutes(fastify: FastifyInstance)`.
const serverOptions: FastifyServerOptions = {
  // Instancia propia (no la de `../logger`, ver ahí el porqué): `loggerInstance`
  // rompe la inferencia de tipos de Fastify a través de las funciones
  // `registerXRoutes(fastify: FastifyInstance)`. Mismo nivel via LOG_LEVEL para
  // que los logs de request y los de boot/workers queden consistentes igual.
  logger: { level: process.env.LOG_LEVEL || "info" },
  connectionTimeout: 0,
  // Confía SÓLO en el proxy inmediato (nginx del compose) para resolver
  // `request.ip` desde X-Forwarded-For. Con `true` se confiaba en todos los
  // saltos y, como nginx ANEXA el header en vez de pisarlo, la IP resultante
  // era la que mandaba el cliente: bastaba cambiar X-Forwarded-For en cada
  // request para saltar el límite de login/activación y falsear la IP de la
  // auditoría (auditoría de seguridad, 14/09/2026). Si algún día hay otro
  // proxy adelante de nginx, subir a 2 o listar sus IPs.
  trustProxy: (_address: string, hop: number) => hop < (Number(process.env.TRUST_PROXY_HOPS) || 1),
};
const fastify = Fastify(serverOptions);

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

    const isTS = __filename.endsWith(".ts");
    await normalizeMigrationExtensions(db, isTS);
    await logMigrationDiagnostics(db, path.join(__dirname, "../db/migrations"));

    await db.migrate.latest({
      directory: path.join(__dirname, "../db/migrations"),
      loadExtensions: isTS ? [".ts", ".js"] : [".js"],
    });
    logger.info("[DB] Migraciones al día.");

    await bootstrapDefaultAdmin(db);

    // ─── Plugins ──────────────────────────────────────────────────────────────

    await registerBasePlugins(fastify);
    registerMetrics(fastify);
    registerErrorHandler(fastify);
    await registerRateLimit(fastify, rateLimitRedis);
    await registerWebSocketPlugin(fastify, db, redis, agentService);

    // ─── Health checks ────────────────────────────────────────────────────────

    registerHealthRoutes(fastify, db, redis);

    // ─── Auth middleware ──────────────────────────────────────────────────────

    const { agentAuth, portalAuth, apiKeyAuth } = createAuthMiddleware(fastify, db, redis, agentService);

    // ─── Rutas ────────────────────────────────────────────────────────────────

    registerAllRoutes(fastify, db, redis, agentService, { agentAuth, portalAuth, apiKeyAuth });

    // ─── Start ────────────────────────────────────────────────────────────────

    const port = Number(process.env.PORT) || 3000;
    await fastify.listen({ port, host: "0.0.0.0" });
    fastify.log.info(`Servidor listo en http://0.0.0.0:${port}`);
    registerGracefulShutdown(fastify);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
