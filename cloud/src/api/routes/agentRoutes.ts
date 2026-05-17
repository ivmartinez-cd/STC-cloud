import { FastifyInstance } from "fastify";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { createAgentController } from "../controllers/agentController";

const syncSchema = {
  body: {
    type: "object",
    required: ["readings"],
    properties: {
      readings: {
        type: "array",
        maxItems: 500,
        items: {
          type: "object",
          required: ["device_id", "time"],
          properties: {
            device_id:    { type: "string" },
            ip:           { type: ["string", "null"] },
            brand:        { type: ["string", "null"] },
            model:        { type: ["string", "null"] },
            time:         { type: "string" },
            total_pages:  { type: ["integer", "number", "string", "null"] },
            mono_pages:   { type: ["integer", "number", "string", "null"] },
            color_pages:  { type: ["integer", "number", "string", "null"] },
            toner_black:  { type: ["integer", "number", "string", "null"] },
            toner_cyan:   { type: ["integer", "number", "string", "null"] },
            toner_magenta: { type: ["integer", "number", "string", "null"] },
            toner_yellow: { type: ["integer", "number", "string", "null"] },
            offline:      { type: "boolean" },
          },
        },
      },
    },
  },
};

export function registerAgentRoutes(
  fastify: FastifyInstance,
  redis: Redis,
  agentService: AgentService,
  agentAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createAgentController(fastify, redis, agentService);

  fastify.get("/api/v1/agents/:id/commands", {
    preHandler: agentAuth,
    handler: ctrl.getCommands,
  });

  fastify.post("/api/v1/agents/:id/heartbeat", {
    preHandler: agentAuth,
    handler: ctrl.heartbeat,
  });

  fastify.post("/api/v1/devices/sync", {
    preHandler: agentAuth,
    schema: syncSchema,
    preValidation: async (_request: any) => {
      // Hook de validación — no-op en producción (logs ruidosos eliminados)
    },
    handler: ctrl.syncDevices,
  });

  fastify.post("/api/v1/devices/register", {
    preHandler: agentAuth,
    handler: ctrl.registerDevices,
  });
}
