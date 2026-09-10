import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../agents";
import { createAuthController } from "./auth-controller";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";

// Techos de fuerza bruta en login/activate — deliberadamente INDEPENDIENTES
// de RATE_LIMIT_MAX (ese es el límite general por IP; éstos protegen contra
// probar contraseñas/keys). Configurables por env con el mismo criterio que
// RATE_LIMIT_MAX (ver .env): el default seguro de producción no cambia, pero
// la suite e2e completa (53 archivos, cada uno con su propio login/activate
// de fixture, todos desde la misma IP) los agotaba sin que RATE_LIMIT_MAX
// pudiera compensarlo — encontrado 26/08/2026 corriendo `npm test` completo.
const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10;
const AGENT_ACTIVATE_RATE_LIMIT_MAX = Number(process.env.AGENT_ACTIVATE_RATE_LIMIT_MAX) || 5;

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
      remember: { type: "boolean" },
    },
  },
};

const userCreateSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", minLength: 3, maxLength: 50 },
      password: { type: "string", minLength: 6 },
      role: { type: "string", enum: ["admin", "operator", "client_viewer"] },
      client_id: { type: "string", format: "uuid" },
    },
  },
};

const userUpdateSchema = {
  body: {
    type: "object",
    properties: {
      password: { type: "string", minLength: 6 },
      role: { type: "string", enum: ["admin", "operator", "client_viewer"] },
      active: { type: "boolean" },
      client_id: { type: "string", format: "uuid" },
    },
  },
};

const updateVersionSchema = {
  body: {
    type: "object",
    required: ["version", "url", "hash"],
    properties: {
      version: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
      hash: { type: "string", minLength: 1 },
      // 'stable' | 'legacy' — default 'stable' si no se manda (compat con
      // publicaciones viejas, un solo canal global).
      channel: { type: "string", minLength: 1, maxLength: 20 },
      // 'bundle' | 'zip' — default inferido de la extensión de `url` si no se manda.
      kind: { type: "string", minLength: 1, maxLength: 10 },
    },
  },
};

export function registerAuthRoutes(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService,
  agentAuth: AuthHook,
  portalAuth: AuthHook
) {
  const ctrl = createAuthController(fastify, db, redis, agentService);

  fastify.post("/api/v1/portal/login", {
    schema: portalLoginSchema,
    config: { rateLimit: { max: LOGIN_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
    handler: ctrl.portalLogin,
  });

  // Público (sin `preHandler`): la tira de métricas del panel de marca en /login
  // se ve antes de autenticar. Cacheado en Redis (ver login-stats-controller.ts)
  // para que quedar expuesto sin sesión no habilite pegarle a la DB en cada carga.
  fastify.get("/api/v1/portal/login-stats", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: ctrl.loginStats,
  });

  fastify.post("/api/v1/portal/logout", { handler: ctrl.portalLogout });

  fastify.get("/api/v1/portal/me", {
    preHandler: portalAuth,
    handler: ctrl.portalMe,
  });

  // Ticket de un solo uso para el handshake WS (ver `wsTicketService.ts`) —
  // reemplaza el JWT de sesión que antes viajaba por `?token=`.
  fastify.post("/api/v1/portal/ws-ticket", {
    preHandler: portalAuth,
    handler: ctrl.portalWsTicket,
  });

  // Endpoints para gestión de operadores (protegidos por portalAuth y validados por rol en el controlador)
  fastify.get("/api/v1/portal/users", {
    preHandler: portalAuth,
    handler: ctrl.listUsers,
  });

  fastify.post("/api/v1/portal/users", {
    preHandler: portalAuth,
    schema: userCreateSchema,
    handler: ctrl.createUser,
  });

  fastify.put("/api/v1/portal/users/:id", {
    preHandler: portalAuth,
    schema: userUpdateSchema,
    handler: ctrl.updateUser,
  });

  fastify.delete("/api/v1/portal/users/:id", {
    preHandler: portalAuth,
    handler: ctrl.deleteUser,
  });

  fastify.post("/api/v1/agents/activate", {
    schema: activateSchema,
    config: { rateLimit: { max: AGENT_ACTIVATE_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
    handler: ctrl.agentActivate,
  });

  fastify.post("/api/v1/agents/refresh", {
    schema: refreshSchema,
    handler: ctrl.agentRefresh,
  });

  fastify.get("/api/v1/agents/version", {
    preHandler: agentAuth,
    handler: ctrl.agentVersion,
  });

  fastify.post("/api/v1/portal/agents/version", {
    preHandler: portalAuth,
    schema: updateVersionSchema,
    handler: ctrl.updateAgentVersion,
  });
}
