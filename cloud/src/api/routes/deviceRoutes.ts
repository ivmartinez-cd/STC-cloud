import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createDeviceController } from "../controllers/deviceController";

export function registerDeviceRoutes(
  fastify: FastifyInstance,
  db: Knex,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createDeviceController(db);

  fastify.get("/api/v1/devices", { preHandler: portalAuth, handler: ctrl.listDevices });

  fastify.get("/api/v1/devices/:id", { preHandler: portalAuth, handler: ctrl.getDevice });

  fastify.get("/api/v1/devices/:id/readings", {
    preHandler: portalAuth,
    handler: ctrl.getDeviceReadings,
  });
}
