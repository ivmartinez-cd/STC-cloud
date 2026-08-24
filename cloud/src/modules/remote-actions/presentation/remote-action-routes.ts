import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { REMOTE_ACTIONS, type RemoteActionBatch } from "../domain/entities/remote-action-batch";
import { KnexRemoteActionRepository } from "../infrastructure/database/knex-remote-action-repository";

const createSchema = {
  body: {
    type: "object",
    required: ["action", "agent_ids"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: [...REMOTE_ACTIONS] },
      name: { type: ["string", "null"], maxLength: 120 },
      agent_ids: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", format: "uuid" } },
      scheduled_at: { type: ["string", "null"], format: "date-time" },
    },
  },
};

const idParamSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
};

const listQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 200 },
      offset: { type: "integer", minimum: 0 },
    },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toView(b: RemoteActionBatch & { total_items?: number }) {
  return {
    id: b.id, number: b.number, action: b.action, name: b.name,
    scheduled_at: new Date(b.scheduledAt).toISOString(), status: b.status,
    created_at: new Date(b.createdAt).toISOString(),
    completed_at: b.completedAt ? new Date(b.completedAt).toISOString() : null,
    total_items: b.total_items ?? undefined,
  };
}

function userIdOf(request: FastifyRequest): string | null {
  const user = (request as FastifyRequest & { user?: { userId?: string } }).user;
  return user?.userId ?? null;
}

function buildCreate(db: Knex, repo: KnexRemoteActionRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const b = request.body as Record<string, any>;
    const agents = await db("agents").whereIn("id", b.agent_ids).whereNot("status", "revoked").select("id");
    if (agents.length !== b.agent_ids.length) {
      return reply.status(400).send({ error: "Algún agente no existe o está revocado" });
    }
    const created = await repo.create({
      action: b.action, name: b.name ?? null,
      scheduledAt: b.scheduled_at ? new Date(b.scheduled_at) : new Date(),
      agentIds: b.agent_ids,
    }, userIdOf(request));
    return reply.status(201).send(toView(created));
  };
}

function buildList(repo: KnexRemoteActionRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, any>;
    const { items, total } = await repo.list(q.limit ?? 50, q.offset ?? 0);
    return reply.send({ items: items.map(toView), total });
  };
}

function buildDetail(repo: KnexRemoteActionRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const batch = await repo.findById(id);
    if (!batch) return reply.status(404).send({ error: "Lote no encontrado" });
    const items = await repo.itemsOf(id);
    return reply.send({
      ...toView(batch),
      items: items.map((i) => ({
        agent_id: i.agentId, agent_name: i.agentName,
        command_id: i.commandId, command_status: i.commandStatus,
      })),
    });
  };
}

function buildCancel(repo: KnexRemoteActionRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const cancelled = await repo.cancelIfScheduled(id);
    if (!cancelled) return reply.status(409).send({ error: "Solo se puede cancelar un lote aún programado" });
    return reply.send({ status: "cancelled" });
  };
}

/**
 * Acciones remotas en bloque (Fase 4.6 del gap analysis vs HP SDS). Nada en
 * CLIENT_VIEWER_ROUTES: operación pura, admin/operator.
 */
export function registerRemoteActionRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const repo = new KnexRemoteActionRepository(db);
  const base = "/api/v1/remote-actions";
  fastify.get(base, { preHandler: portalAuth, schema: listQuerySchema, handler: buildList(repo) });
  fastify.post(base, { preHandler: portalAuth, schema: createSchema, handler: buildCreate(db, repo) });
  fastify.get(`${base}/:id`, { preHandler: portalAuth, schema: idParamSchema, handler: buildDetail(repo) });
  fastify.post(`${base}/:id/cancel`, { preHandler: portalAuth, schema: idParamSchema, handler: buildCancel(repo) });
}
