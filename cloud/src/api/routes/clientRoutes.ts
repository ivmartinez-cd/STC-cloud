import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createClientController } from "../controllers/clientController";
import type { AuthHook } from "../middlewares/authMiddleware";

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
// campo (ver updateClient: `?.trim() || null`), así que se acepta explícitamente
// además del formato válido.
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
    },
  },
};

const createApiKeySchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
};

export function registerClientRoutes(
  fastify: FastifyInstance,
  db: Knex,
  portalAuth: AuthHook
) {
  const ctrl = createClientController(db);

  fastify.post("/api/v1/clients", {
    preHandler: portalAuth,
    schema: createClientSchema,
    handler: ctrl.createClient,
  });

  fastify.get("/api/v1/clients", { preHandler: portalAuth, handler: ctrl.listClients });

  fastify.get("/api/v1/clients/:id", { preHandler: portalAuth, handler: ctrl.getClient });

  // No se agrega a CLIENT_VIEWER_ROUTES (rolePolicy.ts) — deny-by-default alcanza
  // para que un client_viewer reciba 403 acá, mismo criterio que PUT /alerts/:id.
  fastify.put("/api/v1/clients/:id", {
    preHandler: portalAuth,
    schema: updateClientSchema,
    handler: ctrl.updateClient,
  });

  fastify.get("/api/v1/clients/:id/monitors", {
    preHandler: portalAuth,
    handler: ctrl.getClientMonitors,
  });

  fastify.get("/api/v1/clients/:id/usage", {
    preHandler: portalAuth,
    handler: ctrl.getClientUsage,
  });

  fastify.get("/api/v1/clients/:id/devices", {
    preHandler: portalAuth,
    handler: ctrl.getClientDevices,
  });

  // Gestión de API keys de la API pública (integración ERP) — deliberadamente
  // NO se agregan a CLIENT_VIEWER_ROUTES: gestionar credenciales de
  // integración no es rol de un client_viewer, deny-by-default.
  fastify.get("/api/v1/clients/:id/api-keys", {
    preHandler: portalAuth,
    handler: ctrl.listApiKeys,
  });

  fastify.post("/api/v1/clients/:id/api-keys", {
    schema: createApiKeySchema,
    preHandler: portalAuth,
    handler: ctrl.createApiKey,
  });

  fastify.delete("/api/v1/clients/:id/api-keys/:keyId", {
    preHandler: portalAuth,
    handler: ctrl.revokeApiKey,
  });
}
