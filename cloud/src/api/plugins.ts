import type { FastifyInstance, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Redis from "ioredis";
import { Queue } from "bullmq";
import type { Knex } from "knex";
import type { AgentService } from "../modules/agents";
import { registerWebSocket } from "../ws/index";
import { registerMetricsRoutes } from "../modules/metrics/http-metrics";
import { setQueueDepthProvider } from "../modules/metrics/registry";
import { captureError } from "../modules/observability/sentry";
import { getClientIp } from "./utils/ip";

/** cors + helmet + cookies + jwt — plugins base, sin dependencias entre sí. */
export async function registerBasePlugins(fastify: FastifyInstance): Promise<void> {
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
}

/**
 * Fase 5.1: `/metrics` + histogramas HTTP, registrado ANTES del rate limit
 * para que el scraper de Prometheus no compita por el presupuesto por IP.
 * Además cablea el proveedor de profundidad de colas (BullMQ) que expone el
 * scraper, con una conexión Redis propia (requisitos de BullMQ:
 * `maxRetriesPerRequest: null`) — no se reusa `rateLimitRedis`.
 */
export function registerMetrics(fastify: FastifyInstance): void {
  registerMetricsRoutes(fastify);
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
}

/**
 * Fase 5.2: los errores no manejados de handlers van a Sentry. Los 4xx (validación
 * de Ajv, errores tipados con `statusCode`) siguen con el comportamiento default
 * de Fastify. Los 5xx NO: el default devolvía `err.message` al cliente, y un
 * error de Postgres le mostraba al usuario nombres de tablas, columnas y
 * constraints (auditoría de seguridad, 14/09/2026). El detalle queda en el log.
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((err, request, reply) => {
    captureError(err, { route: request.url, method: request.method });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) throw err;
    request.log.error({ err, route: request.url }, "Error interno no manejado");
    return reply.status(status).send({ error: "Error interno del servidor" });
  });
}

export async function registerRateLimit(fastify: FastifyInstance, rateLimitRedis: Redis): Promise<void> {
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
}

export async function registerWebSocketPlugin(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
): Promise<void> {
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
}
