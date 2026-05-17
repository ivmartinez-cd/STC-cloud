import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { createPortalAgentController } from "../controllers/portalAgentController";

const createAgentSchema = {
  body: {
    type: "object",
    required: ["clientId", "name"],
    properties: {
      clientId: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 100 },
      ip_ranges: {
        type: "array",
        items: {
          type: "object",
          required: ["start", "end"],
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
        },
      },
      snmp_community: { type: "string", maxLength: 64 },
      scan_interval_minutes: { type: "integer", minimum: 1, maximum: 1440 },
    },
  },
};

const commandSchema = {
  body: {
    type: "object",
    required: ["type"],
    properties: {
      type: {
        type: "string",
        enum: ["FORCE_SCAN", "RESTART", "UPDATE_CONFIG", "STC_CONSOLE", "FORCE_UPDATE"],
      },
      payload: { type: "object" },
    },
  },
};

export function registerPortalAgentRoutes(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createPortalAgentController(fastify, db, redis, agentService);

  fastify.get("/api/v1/agents", { preHandler: portalAuth, handler: ctrl.listAgents });

  fastify.get("/api/v1/agents/:id", { preHandler: portalAuth, handler: ctrl.getAgent });

  fastify.get("/api/v1/agents/:id/devices", {
    preHandler: portalAuth,
    handler: ctrl.getAgentDevices,
  });

  fastify.post("/api/v1/agents", {
    preHandler: portalAuth,
    schema: createAgentSchema,
    handler: ctrl.createAgent,
  });

  fastify.delete("/api/v1/agents/:id", { preHandler: portalAuth, handler: ctrl.deleteAgent });

  fastify.post("/api/v1/agents/:id/revoke", { preHandler: portalAuth, handler: ctrl.revokeAgent });

  fastify.post("/api/v1/agents/:id/regenerate-key", {
    preHandler: portalAuth,
    handler: ctrl.regenerateKey,
  });

  fastify.post("/api/v1/agents/:id/command", {
    preHandler: portalAuth,
    schema: commandSchema,
    handler: ctrl.sendCommand,
  });

  fastify.post("/api/v1/agents/:id/scan", { preHandler: portalAuth, handler: ctrl.triggerScan });

  fastify.get("/api/v1/agents/:id/logs", { preHandler: portalAuth, handler: ctrl.getLogs });

  fastify.get("/api/v1/agents/:id/logs/export", {
    preHandler: portalAuth,
    handler: ctrl.exportLogs,
  });

  fastify.get("/api/v1/agents/:id/config", { preHandler: portalAuth, handler: ctrl.getConfig });

  fastify.put("/api/v1/agents/:id/config", {
    preHandler: portalAuth,
    handler: ctrl.updateConfig,
  });
}
