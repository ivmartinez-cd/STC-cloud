import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { httpRequestDuration, register } from "./registry";

/**
 * Endpoint `/metrics` + hooks de latencia HTTP (Fase 5.1). El endpoint es
 * para el scraper de Prometheus, NO para el portal: si `METRICS_TOKEN` está
 * definido exige `Authorization: Bearer <token>`; sin definir queda abierto
 * (criterio: en producción se define, y el `docker-compose.prod` no publica
 * el puerto fuera de la red interna).
 */
export function metricsAuthOk(authHeader: string | undefined, token: string | undefined): boolean {
  if (!token) return true;
  return authHeader === `Bearer ${token}`;
}

/** La ruta declarada (con :params), nunca la URL cruda — cardinalidad acotada. */
function routeLabelOf(request: FastifyRequest): string {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((request as any).routeOptions?.url as string) || "unmatched";
}

export function registerMetricsRoutes(fastify: FastifyInstance): void {
  fastify.addHook("onResponse", (request, reply, done) => {
    const route = routeLabelOf(request);
    if (route !== "/metrics") {
      httpRequestDuration.observe(
        { method: request.method, route, status: String(reply.statusCode) },
        reply.elapsedTime / 1000
      );
    }
    done();
  });

  fastify.get("/metrics", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!metricsAuthOk(request.headers.authorization, process.env.METRICS_TOKEN)) {
      return reply.status(401).send({ error: "No autorizado" });
    }
    return reply.header("Content-Type", register.contentType).send(await register.metrics());
  });
}
