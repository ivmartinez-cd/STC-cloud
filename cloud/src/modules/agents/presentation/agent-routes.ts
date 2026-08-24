import type { FastifyInstance, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { getClientIp } from "../../../api/utils/ip";
import type { AgentService } from "../index";
import { createAgentController } from "./agent-controller";

/**
 * Rate-limit por agente, no por IP compartida — sin esto, varios agentes del
 * mismo cliente detrás de un NAT compiten por el mismo cupo global de esa IP.
 * `hook: 'preHandler'` es imprescindible: por default @fastify/rate-limit
 * engancha en `onRequest`, ANTES del `preHandler: agentAuth`, y `request.user`
 * todavía no existe (caería siempre al fallback por IP).
 */
function agentRateLimitKey(request: FastifyRequest): string {
  const agentId = (request.user as { agentId?: string } | undefined)?.agentId;
  return agentId ? `agent:${agentId}` : getClientIp(request);
}

const agentRateLimit = { max: 20, timeWindow: "1 minute", hook: "preHandler" as const, keyGenerator: agentRateLimitKey };

const numberish = { type: ["integer", "number", "string", "null"] };
const stringish = { type: ["string", "null"] };

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
            reading_id: stringish, device_id: { type: "string" }, ip: stringish, brand: stringish, model: stringish, time: { type: "string" },
            total_pages: numberish, mono_pages: numberish, color_pages: numberish,
            toner_black: numberish, toner_cyan: numberish, toner_magenta: numberish, toner_yellow: numberish,
            cartridge_code_black: stringish, cartridge_code_cyan: stringish, cartridge_code_magenta: stringish, cartridge_code_yellow: stringish,
            cartridge_serial_black: stringish, cartridge_serial_cyan: stringish, cartridge_serial_magenta: stringish, cartridge_serial_yellow: stringish,
            cartridge_capacity_black: numberish, cartridge_capacity_cyan: numberish, cartridge_capacity_magenta: numberish, cartridge_capacity_yellow: numberish,
            cartridge_printed_black: numberish, cartridge_printed_cyan: numberish, cartridge_printed_magenta: numberish, cartridge_printed_yellow: numberish,
            cartridge_estimated_black: numberish, cartridge_estimated_cyan: numberish, cartridge_estimated_magenta: numberish, cartridge_estimated_yellow: numberish,
            // Fase 10 — ausente en agentes <1.1.0 (el cloud deriva un fallback desde `supplies_details`).
            supply_origin: { type: ["string", "null"], enum: ["genuine", "non_genuine", null] },
            serial: stringish, firmware: stringish, mac: stringish, hostname: stringish, location: stringish, poll_method: stringish,
            supplies_details: { type: ["object", "string", "null"] },
            offline: { type: "boolean" },
          },
        },
      },
    },
  },
};

export function registerAgentRoutes(fastify: FastifyInstance, redis: Redis, agentService: AgentService, agentAuth: AuthHook) {
  const ctrl = createAgentController(fastify, redis, agentService);

  fastify.get("/api/v1/agents/:id/commands", { preHandler: agentAuth, handler: ctrl.getCommands });
  fastify.post("/api/v1/agents/:id/heartbeat", { preHandler: agentAuth, config: { rateLimit: agentRateLimit }, handler: ctrl.heartbeat });
  fastify.post("/api/v1/devices/sync", {
    preHandler: agentAuth, schema: syncSchema, config: { rateLimit: agentRateLimit },
    preValidation: async (_request: FastifyRequest) => { /* no-op en producción (logs ruidosos eliminados) */ },
    handler: ctrl.syncDevices,
  });
  fastify.post("/api/v1/devices/register", { preHandler: agentAuth, handler: ctrl.registerDevices });
}
