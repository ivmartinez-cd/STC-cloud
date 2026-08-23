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
    },
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
}
