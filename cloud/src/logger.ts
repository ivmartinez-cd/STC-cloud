import pino from "pino";

// Para los workers/servicios que corren fuera del ciclo de request (BullMQ,
// setInterval jobs, bootstrap de server.ts) — mismo nivel/formato JSON
// estructurado que Fastify usa en sus propios logs de request, en vez de que
// cada archivo escriba a stdout con console.log. NO se le pasa a Fastify como
// `loggerInstance`: eso rompe la inferencia de tipos de `FastifyInstance` a
// través de las funciones `registerXRoutes`. Fastify sigue con su propio pino
// interno (`{ logger: { level } }` en server.ts), mismo LOG_LEVEL.
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});
