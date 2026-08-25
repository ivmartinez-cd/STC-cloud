import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { CreateApiKeyUseCase, ListApiKeysUseCase, RevokeApiKeyUseCase } from "../application/use-cases/client-api-key-use-cases";
import {
  IgnorePendingDevicesUseCase, ListPendingDevicesUseCase, RegisterPendingDevicesUseCase,
} from "../application/use-cases/client-pending-device-use-cases";
import {
  CreateClientUseCase, GetClientDevicesUseCase, GetClientMonitorsUseCase, GetClientUsageUseCase, GetClientUseCase,
  ListClientsUseCase, UpdateClientUseCase,
} from "../application/use-cases/client-use-cases";
import { GetWebhookUseCase, PutWebhookUseCase } from "../application/use-cases/client-webhook-use-cases";
import { ApiKeyServiceStore } from "../infrastructure/adapters/api-key-service-store";
import { DeviceRegistrationServiceGateway } from "../infrastructure/adapters/device-registration-service-gateway";
import { PublicWebhookConfigStore } from "../infrastructure/adapters/public-webhook-config-store";
import { KnexAuditLogWriter } from "../infrastructure/database/knex-audit-log-writer";
import { KnexClientRepository } from "../infrastructure/database/knex-client-repository";
import { createClientController, type ClientUseCases } from "./client-controller";

const createClientSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      contact_name: { type: "string", maxLength: 100 },
      contact_email: { type: "string", format: "email" },
      contact_phone: { type: "string", maxLength: 50 },
    },
  },
};

// `format:"email"` a secas rechaza "" — y "" es justamente cómo se limpia el
// campo (ver buildClientUpdates: `?.trim() || null`), así que se acepta
// explícitamente además del formato válido.
const emailOrEmpty = { type: "string", anyOf: [{ format: "email" }, { const: "" }] };

const updateClientSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      contact_name: { type: "string", maxLength: 100 },
      contact_email: emailOrEmpty,
      contact_phone: { type: "string", maxLength: 50 },
      address: { type: "string", maxLength: 255 },
      country: { type: "string", maxLength: 100 },
      notification_email: emailOrEmpty,
      notification_webhook_url: { type: "string", maxLength: 500 },
      notification_events: {
        type: "array", maxItems: 10,
        items: { type: "string", enum: [
          "alert.created", "incident.created",
          "supply_request.created", "supply_request.completed", "report.closed",
          "alert.digest",
        ] },
      },
      device_approval_required: { type: "boolean" },
    },
  },
};

const pendingDevicesRegisterSchema = {
  body: {
    type: "object",
    required: ["deviceIds"],
    additionalProperties: false,
    properties: {
      deviceIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string", format: "uuid" } },
      zoneId: { type: "string" },
    },
  },
};

const pendingDevicesIgnoreSchema = {
  body: {
    type: "object",
    required: ["deviceIds", "reason"],
    additionalProperties: false,
    properties: {
      deviceIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string", format: "uuid" } },
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
};

const createApiKeySchema = {
  body: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } },
};

const putWebhookSchema = {
  body: {
    type: "object",
    properties: {
      url: { type: "string", maxLength: 500 },
      events: { type: "array", items: { type: "string" }, maxItems: 3 },
      active: { type: "boolean" },
      regenerate_secret: { type: "boolean" },
    },
  },
};

function buildUseCases(db: Knex): ClientUseCases {
  const clients = new KnexClientRepository(db);
  const audit = new KnexAuditLogWriter(db);
  const keys = new ApiKeyServiceStore(db);
  const webhooks = new PublicWebhookConfigStore(db);
  const registration = new DeviceRegistrationServiceGateway(db);
  return {
    create: new CreateClientUseCase(clients, audit), update: new UpdateClientUseCase(clients, audit),
    list: new ListClientsUseCase(clients), get: new GetClientUseCase(clients),
    monitors: new GetClientMonitorsUseCase(clients), usage: new GetClientUsageUseCase(clients), devices: new GetClientDevicesUseCase(clients),
    listApiKeys: new ListApiKeysUseCase(keys), createApiKey: new CreateApiKeyUseCase(keys), revokeApiKey: new RevokeApiKeyUseCase(keys),
    getWebhook: new GetWebhookUseCase(webhooks), putWebhook: new PutWebhookUseCase(webhooks),
    listPending: new ListPendingDevicesUseCase(registration), registerPending: new RegisterPendingDevicesUseCase(registration),
    ignorePending: new IgnorePendingDevicesUseCase(registration),
  };
}

export function registerClientRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createClientController(buildUseCases(db));

  fastify.post("/api/v1/clients", { preHandler: portalAuth, schema: createClientSchema, handler: ctrl.createClient });
  fastify.get("/api/v1/clients", { preHandler: portalAuth, handler: ctrl.listClients });
  fastify.get("/api/v1/clients/:id", { preHandler: portalAuth, handler: ctrl.getClient });
  // No se agrega a CLIENT_VIEWER_ROUTES (rolePolicy.ts) — deny-by-default alcanza
  // para que un client_viewer reciba 403 acá, mismo criterio que PUT /alerts/:id.
  fastify.put("/api/v1/clients/:id", { preHandler: portalAuth, schema: updateClientSchema, handler: ctrl.updateClient });
  fastify.get("/api/v1/clients/:id/monitors", { preHandler: portalAuth, handler: ctrl.getClientMonitors });
  fastify.get("/api/v1/clients/:id/usage", { preHandler: portalAuth, handler: ctrl.getClientUsage });
  fastify.get("/api/v1/clients/:id/devices", { preHandler: portalAuth, handler: ctrl.getClientDevices });

  // Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS) —
  // deliberadamente NO se agregan a CLIENT_VIEWER_ROUTES, deny-by-default.
  fastify.get("/api/v1/clients/:id/pending-devices", { preHandler: portalAuth, handler: ctrl.listPendingDevices });
  fastify.post("/api/v1/clients/:id/pending-devices/register", { preHandler: portalAuth, schema: pendingDevicesRegisterSchema, handler: ctrl.registerPendingDevices });
  fastify.post("/api/v1/clients/:id/pending-devices/ignore", { preHandler: portalAuth, schema: pendingDevicesIgnoreSchema, handler: ctrl.ignorePendingDevices });

  // Gestión de API keys de la API pública (integración ERP) — deliberadamente
  // NO se agregan a CLIENT_VIEWER_ROUTES: gestionar credenciales de
  // integración no es rol de un client_viewer, deny-by-default.
  fastify.get("/api/v1/clients/:id/api-keys", { preHandler: portalAuth, handler: ctrl.listApiKeys });
  fastify.post("/api/v1/clients/:id/api-keys", { schema: createApiKeySchema, preHandler: portalAuth, handler: ctrl.createApiKey });
  fastify.delete("/api/v1/clients/:id/api-keys/:keyId", { preHandler: portalAuth, handler: ctrl.revokeApiKey });

  // Config del webhook de la API pública (`api_webhooks`) — mismo criterio de
  // deny-by-default para client_viewer que las API keys de arriba.
  fastify.get("/api/v1/clients/:id/webhook", { preHandler: portalAuth, handler: ctrl.getWebhook });
  fastify.put("/api/v1/clients/:id/webhook", { schema: putWebhookSchema, preHandler: portalAuth, handler: ctrl.putWebhook });
}
