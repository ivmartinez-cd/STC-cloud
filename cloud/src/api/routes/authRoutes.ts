import { FastifyInstance } from "fastify";
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

export function registerAuthRoutes(
  fastify: FastifyInstance,
  agentService: AgentService,
  agentAuth: (request: any, reply: any) => Promise<void>,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createAuthController(fastify, agentService);

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
