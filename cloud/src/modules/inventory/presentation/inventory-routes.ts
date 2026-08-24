import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import {
  ArchiveCustomFieldDefUseCase,
  CreateCustomFieldDefUseCase,
  ListCustomFieldDefsUseCase,
  UpdateCustomFieldDefUseCase,
} from "../application/use-cases/custom-field-def-use-cases";
import {
  CreateDeviceModelUseCase,
  ListDeviceModelsUseCase,
  UpdateDeviceModelUseCase,
} from "../application/use-cases/device-model-use-cases";
import { KnexCustomFieldDefRepository } from "../infrastructure/database/knex-custom-field-def-repository";
import { KnexDeviceModelRepository } from "../infrastructure/database/knex-device-model-repository";
import { createInventoryController } from "./inventory-controller";

const createCustomFieldSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["key", "label", "type"],
    properties: {
      key: { type: "string", minLength: 1, maxLength: 64 },
      label: { type: "string", minLength: 1, maxLength: 100 },
      type: { type: "string", enum: ["text", "number", "date", "select", "boolean"] },
      options: { type: "array", items: { type: "string" } },
      position: { type: "integer" },
    },
  },
};

const updateCustomFieldSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: { type: "string", minLength: 1, maxLength: 100 },
      options: { type: "array", items: { type: "string" } },
      position: { type: "integer" },
    },
  },
};

const createDeviceModelSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["brand", "model_key"],
    properties: {
      brand: { type: "string", minLength: 1, maxLength: 100 },
      model_key: { type: "string", minLength: 1, maxLength: 255 },
      display_name: { type: "string", maxLength: 255 },
      duty_cycle_monthly: { type: "integer", minimum: 1 },
      recommended_volume_monthly: { type: "integer", minimum: 1 },
      is_color: { type: "boolean" },
      notes: { type: "string", maxLength: 2000 },
    },
  },
};

const updateDeviceModelSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      display_name: { type: ["string", "null"], maxLength: 255 },
      duty_cycle_monthly: { type: ["integer", "null"], minimum: 1 },
      recommended_volume_monthly: { type: ["integer", "null"], minimum: 1 },
      is_color: { type: ["boolean", "null"] },
      notes: { type: ["string", "null"], maxLength: 2000 },
    },
  },
};

function buildUseCases(db: Knex) {
  const customFieldDefRepository = new KnexCustomFieldDefRepository(db);
  const deviceModelRepository = new KnexDeviceModelRepository(db);

  return {
    listCustomFields: new ListCustomFieldDefsUseCase(customFieldDefRepository),
    createCustomField: new CreateCustomFieldDefUseCase(customFieldDefRepository),
    updateCustomField: new UpdateCustomFieldDefUseCase(customFieldDefRepository),
    archiveCustomField: new ArchiveCustomFieldDefUseCase(customFieldDefRepository),
    listDeviceModels: new ListDeviceModelsUseCase(deviceModelRepository),
    createDeviceModel: new CreateDeviceModelUseCase(deviceModelRepository),
    updateDeviceModel: new UpdateDeviceModelUseCase(deviceModelRepository),
  };
}

/**
 * Fase 4 del gap analysis vs HP SDS — campos de inventario. Sólo los dos `GET`
 * en `CLIENT_VIEWER_ROUTES` (rolePolicy.ts): un client_viewer necesita el
 * catálogo de campos personalizados y de modelos para RENDERIZAR su propia
 * ficha de dispositivo (`buildSupplyRows`/inventario ya muestra valores;
 * necesita las labels). Crear/editar/archivar campos y modelos es tarea de
 * admin/operator, deny-by-default.
 */
export function registerInventoryRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createInventoryController(buildUseCases(db));

  fastify.get("/api/v1/clients/:id/custom-fields", { preHandler: portalAuth, handler: ctrl.listCustomFields });
  fastify.post("/api/v1/clients/:id/custom-fields", {
    preHandler: portalAuth, schema: createCustomFieldSchema, handler: ctrl.createCustomField,
  });
  fastify.put("/api/v1/clients/:id/custom-fields/:fieldId", {
    preHandler: portalAuth, schema: updateCustomFieldSchema, handler: ctrl.updateCustomField,
  });
  fastify.delete("/api/v1/clients/:id/custom-fields/:fieldId", { preHandler: portalAuth, handler: ctrl.archiveCustomField });

  fastify.get("/api/v1/device-models", { preHandler: portalAuth, handler: ctrl.listDeviceModels });
  fastify.post("/api/v1/device-models", {
    preHandler: portalAuth, schema: createDeviceModelSchema, handler: ctrl.createDeviceModel,
  });
  fastify.put("/api/v1/device-models/:id", {
    preHandler: portalAuth, schema: updateDeviceModelSchema, handler: ctrl.updateDeviceModel,
  });
}
