import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { AgentService } from "../../services/agentService";
import { createAuthController } from "../controllers/authController";

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

const userCreateSchema = {
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", minLength: 3, maxLength: 50 },
      password: { type: "string", minLength: 6 },
      role: { type: "string", enum: ["admin", "operator"] },
    },
  },
};

const userUpdateSchema = {
  body: {
    type: "object",
    properties: {
      password: { type: "string", minLength: 6 },
      role: { type: "string", enum: ["admin", "operator"] },
      active: { type: "boolean" },
    },
  },
};

export function registerAuthRoutes(
  fastify: FastifyInstance,
  db: Knex,
  agentService: AgentService,
  agentAuth: (request: any, reply: any) => Promise<void>,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createAuthController(fastify, db, agentService);

  fastify.post("/api/v1/portal/login", {
    schema: portalLoginSchema,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: ctrl.portalLogin,
  });

  fastify.post("/api/v1/portal/logout", { handler: ctrl.portalLogout });

  fastify.get("/api/v1/portal/me", {
    preHandler: portalAuth,
    handler: ctrl.portalMe,
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
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
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
}
