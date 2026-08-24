import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import type { DeviceCosts } from "../domain/entities/device-costs";
import { KnexDeviceCostsRepository } from "../infrastructure/database/knex-device-costs-repository";

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

const money = { type: ["number", "null"], minimum: 0, maximum: 999999999 };

const putSchema = {
  params: idParams,
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      capital_cost: money,
      quarterly_rental: money,
      mono_page_cost: money,
      color_page_cost: money,
      service_contract_cost: money,
      service_contract_years: { type: ["integer", "null"], minimum: 1, maximum: 20 },
      currency: { type: "string", minLength: 3, maxLength: 3 },
    },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toView(c: DeviceCosts) {
  return {
    device_id: c.deviceId,
    capital_cost: c.capitalCost,
    quarterly_rental: c.quarterlyRental,
    mono_page_cost: c.monoPageCost,
    color_page_cost: c.colorPageCost,
    service_contract_cost: c.serviceContractCost,
    service_contract_years: c.serviceContractYears,
    currency: c.currency,
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

const EMPTY = {
  capital_cost: null, quarterly_rental: null, mono_page_cost: null, color_page_cost: null,
  service_contract_cost: null, service_contract_years: null, currency: "ARS", updated_at: null,
};

function buildGetHandler(db: Knex, repo: KnexDeviceCostsRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const device = await db("devices").where({ id }).select("id").first();
    if (!device) return reply.status(404).send({ error: "Equipo no encontrado" });
    const costs = await repo.findByDevice(id);
    return reply.send(costs ? toView(costs) : { device_id: id, ...EMPTY });
  };
}

function userIdOf(request: FastifyRequest): string | null {
  const user = (request as FastifyRequest & { user?: { userId?: string } }).user;
  return user?.userId ?? null;
}

function buildPutHandler(db: Knex, repo: KnexDeviceCostsRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const device = await db("devices").where({ id }).select("id").first();
    if (!device) return reply.status(404).send({ error: "Equipo no encontrado" });
    const b = request.body as Record<string, any>;
    const saved = await repo.upsert(id, {
      capitalCost: b.capital_cost ?? null,
      quarterlyRental: b.quarterly_rental ?? null,
      monoPageCost: b.mono_page_cost ?? null,
      colorPageCost: b.color_page_cost ?? null,
      serviceContractCost: b.service_contract_cost ?? null,
      serviceContractYears: b.service_contract_years ?? null,
      currency: (b.currency ?? "ARS").toUpperCase(),
    }, userIdOf(request));
    return reply.send(toView(saved));
  };
}

/**
 * Costes por equipo (Fase 4.5 del gap analysis vs HP SDS — pestaña "Costes"
 * del detalle del SDS). Nada en CLIENT_VIEWER_ROUTES: datos comerciales,
 * admin/operator (el ownership central de /devices/:id aplica igual).
 */
export function registerDeviceCostsRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const repo = new KnexDeviceCostsRepository(db);
  fastify.get("/api/v1/devices/:id/costs", { preHandler: portalAuth, schema: { params: idParams }, handler: buildGetHandler(db, repo) });
  fastify.put("/api/v1/devices/:id/costs", { preHandler: portalAuth, schema: putSchema, handler: buildPutHandler(db, repo) });
}
