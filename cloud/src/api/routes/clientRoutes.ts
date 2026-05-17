import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createClientController } from "../controllers/clientController";

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

export function registerClientRoutes(
  fastify: FastifyInstance,
  db: Knex,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createClientController(db);

  fastify.post("/api/v1/clients", {
    preHandler: portalAuth,
    schema: createClientSchema,
    handler: ctrl.createClient,
  });

  fastify.get("/api/v1/clients", { preHandler: portalAuth, handler: ctrl.listClients });

  fastify.get("/api/v1/clients/:id", { preHandler: portalAuth, handler: ctrl.getClient });

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
}
