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

/**
 * Forma gruesa del latido (auditoría 14/09/2026: antes sin schema, un agente
 * podía inflar `agent_logs` sin tope o romper el lote con un `level` más largo
 * que la columna). Sin `additionalProperties:false` a propósito: agentes
 * viejos mandan campos que la nube ignora.
 */
const heartbeatSchema = {
  body: {
    type: "object",
    properties: {
      logs: {
        type: "array", maxItems: 500,
        items: { type: "object", properties: { level: { type: "string", maxLength: 10 }, message: { type: "string", maxLength: 4000 }, timestamp: { type: "string", maxLength: 40 } } },
      },
      commandResults: {
        type: "array", maxItems: 100,
        items: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" }, status: { type: "string", maxLength: 20 }, result: { type: ["object", "null"] } } },
      },
      system_info: {
        type: "object",
        properties: { version: { type: "string", maxLength: 50 }, host_name: { type: "string", maxLength: 255 }, host_os: { type: "string", maxLength: 255 }, host_ip: { type: "string", maxLength: 64 }, channel: { type: "string", maxLength: 20 }, runtime: { type: "string", maxLength: 64 } },
      },
    },
  },
};

/** Registro de equipos descubiertos: mismo criterio que `syncSchema` (antes sin schema ni rate limit propio). */
const registerSchema = {
  body: {
    type: "object",
    required: ["devices"],
    properties: {
      devices: {
        type: "array", maxItems: 500,
        items: {
          type: "object",
          properties: {
            ip: { type: "string", maxLength: 64 }, mac: { type: ["string", "null"], maxLength: 32 }, serial: { type: ["string", "null"], maxLength: 150 },
            brand: { type: ["string", "null"], maxLength: 50 }, model: { type: ["string", "null"], maxLength: 255 }, name: { type: ["string", "null"], maxLength: 255 },
            hostname: { type: ["string", "null"], maxLength: 255 }, location: { type: ["string", "null"], maxLength: 255 },
          },
        },
      },
    },
  },
};

export function registerAgentRoutes(fastify: FastifyInstance, redis: Redis, agentService: AgentService, agentAuth: AuthHook) {
  const ctrl = createAgentController(fastify, redis, agentService);

  fastify.get("/api/v1/agents/:id/commands", { preHandler: agentAuth, handler: ctrl.getCommands });
  fastify.post("/api/v1/agents/:id/heartbeat", { preHandler: agentAuth, schema: heartbeatSchema, config: { rateLimit: agentRateLimit }, handler: ctrl.heartbeat });
  fastify.post("/api/v1/devices/sync", {
    preHandler: agentAuth, schema: syncSchema, config: { rateLimit: agentRateLimit },
    preValidation: async (_request: FastifyRequest) => { /* no-op en producción (logs ruidosos eliminados) */ },
    handler: ctrl.syncDevices,
  });
  fastify.post("/api/v1/devices/register", { preHandler: agentAuth, schema: registerSchema, config: { rateLimit: agentRateLimit }, handler: ctrl.registerDevices });
}
