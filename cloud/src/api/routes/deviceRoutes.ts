import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createDeviceController } from "../controllers/deviceController";
import type { AuthHook } from "../middlewares/authMiddleware";

const updateDeviceSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: ["string", "null"], maxLength: 255 },
      location: { type: ["string", "null"], maxLength: 255 },
      // Fase 4 del gap analysis vs HP SDS — inventario manual/derivado.
      asset_number: { type: ["string", "null"], maxLength: 64 },
      asset_tag: { type: ["string", "null"], maxLength: 64 },
      duty_cycle_monthly: { type: ["integer", "null"], minimum: 1 },
      custom_data: { type: "object" },
    },
  },
};

const monitorStateSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["state"],
    properties: {
      state: { type: "string", enum: ["full", "supplies_only", "reports_only", "disabled"] },
      reason: { type: "string", maxLength: 500 },
    },
  },
};

const unignoreSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: { reason: { type: "string", maxLength: 500 } },
  },
};

const decommissionSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 3, maxLength: 500 } },
  },
};

const recommissionSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: { reason: { type: "string", maxLength: 500 } },
  },
};

const moveSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["agentId", "reason"],
    properties: {
      agentId: { type: "string" },
      reason: { type: "string", minLength: 3, maxLength: 500 },
      confirmClientChange: { type: "boolean" },
    },
  },
};

const mergeSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["sourceDeviceId"],
    properties: {
      sourceDeviceId: { type: "string" },
      reason: { type: "string", maxLength: 500 },
      onOverlap: { type: "string", enum: ["abort", "keep_target", "keep_source"] },
      dryRun: { type: "boolean" },
      force: { type: "boolean" },
    },
  },
};

// Fase 9 del gap analysis vs HP SDS — acciones en bloque. `ids` con tope 500
// (mismo criterio que `deviceIds` de la cola de registro, Fase 7).
const bulkIdsField = { type: "array", minItems: 1, maxItems: 500, items: { type: "string", format: "uuid" } };

const bulkDecommissionSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["ids", "reason"],
    properties: { ids: bulkIdsField, reason: { type: "string", minLength: 3, maxLength: 500 }, dryRun: { type: "boolean" } },
  },
};

const bulkRecommissionSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["ids"],
    properties: { ids: bulkIdsField, reason: { type: "string", maxLength: 500 } },
  },
};

const bulkMoveSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["ids", "agentId", "reason"],
    properties: {
      ids: bulkIdsField,
      agentId: { type: "string" },
      reason: { type: "string", minLength: 3, maxLength: 500 },
      confirmClientChange: { type: "boolean" },
    },
  },
};

const bulkMonitorStateSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["ids", "state"],
    properties: {
      ids: bulkIdsField,
      state: { type: "string", enum: ["full", "supplies_only", "reports_only", "disabled"] },
      reason: { type: "string", maxLength: 500 },
    },
  },
};

export function registerDeviceRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createDeviceController(db);

  fastify.get("/api/v1/devices", { preHandler: portalAuth, handler: ctrl.listDevices });

  // Estático antes que /:id en el registro (Fastify usa un router radix que
  // prioriza segmentos estáticos, así que el orden de registro no importa en
  // la práctica, pero se declara primero por claridad).
  fastify.get("/api/v1/devices/duplicates", { preHandler: portalAuth, handler: ctrl.listDuplicates });

  fastify.get("/api/v1/devices/:id", { preHandler: portalAuth, handler: ctrl.getDevice });

  fastify.get("/api/v1/devices/:id/readings", {
    preHandler: portalAuth,
    handler: ctrl.getDeviceReadings,
  });

  // Historial de uso desde los agregados continuos — ver comentario en el
  // controller. Sin UI de portal todavía (deliberado, misma razón que la
  // API pública de esta pasada: otra sesión trabajaba en simultáneo sobre
  // cloud/portal/).
  fastify.get("/api/v1/devices/:id/usage-history", {
    preHandler: portalAuth,
    handler: ctrl.getDeviceUsageHistory,
  });

  // Fase 8 del gap analysis vs HP SDS — superficie de consumibles.
  fastify.get("/api/v1/devices/:id/supplies", {
    preHandler: portalAuth,
    handler: ctrl.getDeviceSupplies,
  });

  // Ninguna de las mutaciones de abajo entra a CLIENT_VIEWER_ROUTES: quedan en
  // 403 automático por deny-by-default (ver rolePolicy.ts).
  fastify.put("/api/v1/devices/:id", {
    preHandler: portalAuth, schema: updateDeviceSchema, handler: ctrl.updateDevice,
  });

  fastify.post("/api/v1/devices/:id/decommission", {
    preHandler: portalAuth, schema: decommissionSchema, handler: ctrl.decommissionDevice,
  });

  fastify.post("/api/v1/devices/:id/recommission", {
    preHandler: portalAuth, schema: recommissionSchema, handler: ctrl.recommissionDevice,
  });

  fastify.post("/api/v1/devices/:id/move", {
    preHandler: portalAuth, schema: moveSchema, handler: ctrl.moveDevice,
  });

  fastify.post("/api/v1/devices/:id/merge", {
    preHandler: portalAuth, schema: mergeSchema, handler: ctrl.mergeDevice,
  });

  fastify.delete("/api/v1/devices/:id", {
    preHandler: portalAuth,
    handler: ctrl.deleteDevice,
  });

  // Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular. Endpoint
  // dedicado (no un campo más de PUT /devices/:id) para que el audit `action`
  // sea propio y el RBAC quede separable — mismo criterio que el toggle de
  // `remote_ews_enabled` (guardado independiente del resto de la config).
  fastify.put("/api/v1/devices/:id/monitor-state", {
    preHandler: portalAuth, schema: monitorStateSchema, handler: ctrl.updateMonitorState,
  });

  // Fase 7 del gap analysis vs HP SDS — cola de registro, deliberadamente NO
  // se agrega a CLIENT_VIEWER_ROUTES.
  fastify.post("/api/v1/devices/:id/unignore", {
    preHandler: portalAuth, schema: unignoreSchema, handler: ctrl.unignoreDevice,
  });

  // Fase 9 del gap analysis vs HP SDS — acciones en bloque. Segmento estático
  // "bulk" antes que ":id" en cada ruta — Fastify (find-my-way) prioriza rutas
  // estáticas sobre paramétricas en el mismo nivel, mismo criterio ya usado en
  // "/devices/duplicates" vs "/devices/:id" más arriba.
  fastify.post("/api/v1/devices/bulk/decommission", {
    preHandler: portalAuth, schema: bulkDecommissionSchema, handler: ctrl.bulkDecommissionDevices,
  });

  fastify.post("/api/v1/devices/bulk/recommission", {
    preHandler: portalAuth, schema: bulkRecommissionSchema, handler: ctrl.bulkRecommissionDevices,
  });

  fastify.post("/api/v1/devices/bulk/move", {
    preHandler: portalAuth, schema: bulkMoveSchema, handler: ctrl.bulkMoveDevices,
  });

  fastify.post("/api/v1/devices/bulk/monitor-state", {
    preHandler: portalAuth, schema: bulkMonitorStateSchema, handler: ctrl.bulkSetMonitorState,
  });
}
