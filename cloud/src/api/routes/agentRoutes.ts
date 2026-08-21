import { FastifyInstance, FastifyRequest } from "fastify";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { createAgentController } from "../controllers/agentController";
import type { AuthHook } from "../middlewares/authMiddleware";

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
            reading_id:   { type: ["string", "null"] },
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
            cartridge_code_black:       { type: ["string", "null"] },
            cartridge_code_cyan:        { type: ["string", "null"] },
            cartridge_code_magenta:     { type: ["string", "null"] },
            cartridge_code_yellow:      { type: ["string", "null"] },
            cartridge_serial_black:     { type: ["string", "null"] },
            cartridge_serial_cyan:      { type: ["string", "null"] },
            cartridge_serial_magenta:   { type: ["string", "null"] },
            cartridge_serial_yellow:    { type: ["string", "null"] },
            cartridge_capacity_black:   { type: ["integer", "number", "string", "null"] },
            cartridge_capacity_cyan:    { type: ["integer", "number", "string", "null"] },
            cartridge_capacity_magenta: { type: ["integer", "number", "string", "null"] },
            cartridge_capacity_yellow:  { type: ["integer", "number", "string", "null"] },
            cartridge_printed_black:    { type: ["integer", "number", "string", "null"] },
            cartridge_printed_cyan:     { type: ["integer", "number", "string", "null"] },
            cartridge_printed_magenta:  { type: ["integer", "number", "string", "null"] },
            cartridge_printed_yellow:   { type: ["integer", "number", "string", "null"] },
            cartridge_estimated_black:  { type: ["integer", "number", "string", "null"] },
            cartridge_estimated_cyan:   { type: ["integer", "number", "string", "null"] },
            cartridge_estimated_magenta:{ type: ["integer", "number", "string", "null"] },
            cartridge_estimated_yellow: { type: ["integer", "number", "string", "null"] },
            serial:       { type: ["string", "null"] },
            firmware:     { type: ["string", "null"] },
            mac:          { type: ["string", "null"] },
            hostname:     { type: ["string", "null"] },
            location:     { type: ["string", "null"] },
            poll_method:  { type: ["string", "null"] },
            supplies_details: { type: ["object", "string", "null"] },
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
  agentAuth: AuthHook
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
    preValidation: async (_request: FastifyRequest) => {
      // Hook de validación — no-op en producción (logs ruidosos eliminados)
    },
    handler: ctrl.syncDevices,
  });

  fastify.post("/api/v1/devices/register", {
    preHandler: agentAuth,
    handler: ctrl.registerDevices,
  });
}
