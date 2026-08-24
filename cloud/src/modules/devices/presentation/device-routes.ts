import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { buildDeviceBulkUseCases, buildDeviceUseCases } from "./device-wiring";
import { createDeviceBulkController } from "./device-bulk-controller";
import { createDeviceController } from "./device-controller";

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
    type: "object", additionalProperties: false, required: ["state"],
    properties: {
      state: { type: "string", enum: ["full", "supplies_only", "reports_only", "disabled"] },
      reason: { type: "string", maxLength: 500 },
    },
  },
};

const reasonOnly = (required: boolean, minLength?: number) => ({
  body: {
    type: "object", additionalProperties: false, ...(required ? { required: ["reason"] } : {}),
    properties: { reason: { type: "string", ...(minLength ? { minLength } : {}), maxLength: 500 } },
  },
});
const unignoreSchema = reasonOnly(false);
const decommissionSchema = reasonOnly(true, 3);
const recommissionSchema = reasonOnly(false);

const moveSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["agentId", "reason"],
    properties: { agentId: { type: "string" }, reason: { type: "string", minLength: 3, maxLength: 500 }, confirmClientChange: { type: "boolean" } },
  },
};

const mergeSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["sourceDeviceId"],
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
  body: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids: bulkIdsField, reason: { type: "string", maxLength: 500 } } },
};

const bulkMoveSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["ids", "agentId", "reason"],
    properties: { ids: bulkIdsField, agentId: { type: "string" }, reason: { type: "string", minLength: 3, maxLength: 500 }, confirmClientChange: { type: "boolean" } },
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
  const ctrl = createDeviceController(buildDeviceUseCases(db));
  const bulk = createDeviceBulkController(buildDeviceBulkUseCases(db));
  const auth = { preHandler: portalAuth };

  fastify.get("/api/v1/devices", { ...auth, handler: ctrl.listDevices });
  // Estático antes que /:id — Fastify (find-my-way) prioriza segmentos estáticos; se declara primero por claridad.
  fastify.get("/api/v1/devices/duplicates", { ...auth, handler: ctrl.listDuplicates });
  fastify.get("/api/v1/devices/:id", { ...auth, handler: ctrl.getDevice });
  fastify.get("/api/v1/devices/:id/readings", { ...auth, handler: ctrl.getDeviceReadings });
  // Historial desde los agregados continuos — ver el caso de uso. Sin UI de portal todavía.
  fastify.get("/api/v1/devices/:id/usage-history", { ...auth, handler: ctrl.getDeviceUsageHistory });
  // Fase 8 del gap analysis vs HP SDS — superficie de consumibles.
  fastify.get("/api/v1/devices/:id/supplies", { ...auth, handler: ctrl.getDeviceSupplies });

  // Ninguna de las mutaciones de abajo entra a CLIENT_VIEWER_ROUTES: quedan en
  // 403 automático por deny-by-default (ver rolePolicy.ts).
  fastify.put("/api/v1/devices/:id", { ...auth, schema: updateDeviceSchema, handler: ctrl.updateDevice });
  fastify.post("/api/v1/devices/:id/decommission", { ...auth, schema: decommissionSchema, handler: ctrl.decommissionDevice });
  fastify.post("/api/v1/devices/:id/recommission", { ...auth, schema: recommissionSchema, handler: ctrl.recommissionDevice });
  fastify.post("/api/v1/devices/:id/move", { ...auth, schema: moveSchema, handler: ctrl.moveDevice });
  fastify.post("/api/v1/devices/:id/merge", { ...auth, schema: mergeSchema, handler: ctrl.mergeDevice });
  fastify.delete("/api/v1/devices/:id", { ...auth, handler: ctrl.deleteDevice });
  // Fase 5 — estado de monitoreo granular: endpoint dedicado para que el audit `action` sea propio y el RBAC separable.
  fastify.put("/api/v1/devices/:id/monitor-state", { ...auth, schema: monitorStateSchema, handler: ctrl.updateMonitorState });
  // Fase 7 — cola de registro, deliberadamente NO en CLIENT_VIEWER_ROUTES.
  fastify.post("/api/v1/devices/:id/unignore", { ...auth, schema: unignoreSchema, handler: ctrl.unignoreDevice });

  // Fase 9 — acciones en bloque. Segmento estático "bulk" antes que ":id" (find-my-way prioriza estáticos).
  fastify.post("/api/v1/devices/bulk/decommission", { ...auth, schema: bulkDecommissionSchema, handler: bulk.bulkDecommissionDevices });
  fastify.post("/api/v1/devices/bulk/recommission", { ...auth, schema: bulkRecommissionSchema, handler: bulk.bulkRecommissionDevices });
  fastify.post("/api/v1/devices/bulk/move", { ...auth, schema: bulkMoveSchema, handler: bulk.bulkMoveDevices });
  fastify.post("/api/v1/devices/bulk/monitor-state", { ...auth, schema: bulkMonitorStateSchema, handler: bulk.bulkSetMonitorState });
}
