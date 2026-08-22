import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { createPortalAgentController } from "../controllers/portalAgentController";
import { createDeviceController } from "../controllers/deviceController";
import type { AuthHook } from "../middlewares/authMiddleware";

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

const updateConfigSchema = {
  body: {
    type: "object",
    properties: {
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
      // Validación superficial: el detalle de mode/custom_days/custom_times lo
      // interpreta agentService.updateConfig; acá solo se bloquea basura no-objeto.
      scan_schedule: { type: "object" },
      toner_warning_threshold: { type: "integer", minimum: 0, maximum: 100 },
      toner_critical_threshold: { type: "integer", minimum: 0, maximum: 100 },
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
  portalAuth: AuthHook
) {
  const ctrl = createPortalAgentController(fastify, db, redis, agentService);
  const deviceCtrl = createDeviceController(db);

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
    schema: updateConfigSchema,
    handler: ctrl.updateConfig,
  });

  // Reemplaza a `DELETE /devices/offline`: colgada de /agents/:id hereda el
  // chequeo central de ownership (deviceIdParamMatchesScope no aplica acá,
  // pero agentIdParamMatchesScope sí, vía AGENT_ID_URL_PREFIX) que al `agent_id`
  // de query string del endpoint viejo le faltaba. Da de baja, no borra.
  fastify.post("/api/v1/agents/:id/devices/decommission-stale", {
    preHandler: portalAuth,
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        properties: {
          inactiveDays: { type: "integer", minimum: 7, maximum: 365 },
          dryRun: { type: "boolean" },
          reason: { type: "string", maxLength: 500 },
        },
      },
    },
    handler: deviceCtrl.decommissionStaleDevices,
  });
}
