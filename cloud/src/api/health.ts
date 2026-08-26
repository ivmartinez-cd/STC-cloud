import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import { SERVER_VERSION } from "../version";

// ioredis reintenta indefinidamente y encola comandos mientras está
// desconectado: sin un timeout propio, `redis.ping()` puede colgarse en
// vez de fallar rápido si Redis está caído. Mismo criterio para Postgres,
// por consistencia.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export function registerHealthRoutes(fastify: FastifyInstance, db: Knex, redis: Redis): void {
  fastify.get("/", async () => ({ status: "ok", service: "stc-cloud-api" }));

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
  fastify.get("/api/v1/agents/download-installer", async (_request, reply) => {
    // Redirigimos al asset en el último release de GitHub para evitar binarios pesados en el repo
    reply.redirect("https://github.com/ivmartinez-cd/STC-cloud/releases/latest/download/Instalador-STC-Monitor.exe");
  });
}
