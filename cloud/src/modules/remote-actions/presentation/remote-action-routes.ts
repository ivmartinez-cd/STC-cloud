import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import {
  REMOTE_ACTIONS, REMOTE_ACTION_SEGMENTS, targetKindOf,
  type RemoteActionBatch, type RemoteActionSegment,
} from "../domain/entities/remote-action-batch";
import { detectSystemicFailure } from "../domain/services/remote-action-insights";
import { KnexRemoteActionRepository, type BatchTarget } from "../infrastructure/database/knex-remote-action-repository";

const createSchema = {
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: [...REMOTE_ACTIONS] },
      name: { type: ["string", "null"], maxLength: 120 },
      agent_ids: { type: "array", maxItems: 100, items: { type: "string", format: "uuid" } },
      device_ids: { type: "array", maxItems: 100, items: { type: "string", format: "uuid" } },
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
      q: { type: "string", maxLength: 120 },
      segment: { type: "string", enum: [...REMOTE_ACTION_SEGMENTS] },
      dir: { type: "string", enum: ["asc", "desc"] },
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

async function resolveAgentTargets(db: Knex, agentIds: string[]): Promise<BatchTarget[] | null> {
  const agents = await db("agents").whereIn("id", agentIds).whereNot("status", "revoked").select("id");
  if (agents.length !== agentIds.length) return null;
  return agentIds.map((agentId) => ({ agentId }));
}

/** RESTART_PRINTER: cada `device_id` se resuelve a su agente + IP actual (snapshot al crear el lote). */
async function resolveDeviceTargets(db: Knex, deviceIds: string[]): Promise<BatchTarget[] | null> {
  const rows = await db("devices")
    .whereIn("devices.id", deviceIds)
    .join("agents", "agents.id", "devices.agent_id")
    .whereNot("agents.status", "revoked")
    .select("devices.id as device_id", "devices.agent_id", "devices.ip_address");
  if (rows.length !== deviceIds.length) return null;
  if (rows.some((r) => !r.ip_address)) return null;
  return rows.map((r) => ({ agentId: r.agent_id, deviceId: r.device_id, deviceIp: r.ip_address }));
}

type TargetResolution = { targets: BatchTarget[] } | { error: string };

async function resolveTargets(db: Knex, kind: "agent" | "device", b: Record<string, any>): Promise<TargetResolution> {
  if (kind === "device") {
    if (!Array.isArray(b.device_ids) || b.device_ids.length === 0) {
      return { error: "Esta acción requiere device_ids (equipos, no agentes)" };
    }
    const targets = await resolveDeviceTargets(db, b.device_ids);
    if (!targets) return { error: "Algún equipo no existe, su agente está revocado, o no tiene IP conocida" };
    return { targets };
  }
  if (!Array.isArray(b.agent_ids) || b.agent_ids.length === 0) {
    return { error: "Esta acción requiere agent_ids" };
  }
  const targets = await resolveAgentTargets(db, b.agent_ids);
  if (!targets) return { error: "Algún agente no existe o está revocado" };
  return { targets };
}

function buildCreate(db: Knex, repo: KnexRemoteActionRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const b = request.body as Record<string, any>;
    const resolution = await resolveTargets(db, targetKindOf(b.action), b);
    if ("error" in resolution) return reply.status(400).send({ error: resolution.error });

    const created = await repo.create({
      action: b.action, name: b.name ?? null,
      scheduledAt: b.scheduled_at ? new Date(b.scheduled_at) : new Date(),
      targets: resolution.targets,
    }, userIdOf(request));
    return reply.status(201).send(toView(created));
  };
}

function buildList(repo: KnexRemoteActionRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, any>;
    const { items, total } = await repo.list({
      limit: q.limit ?? 50, offset: q.offset ?? 0,
      q: q.q, segment: q.segment as RemoteActionSegment | undefined, dir: q.dir,
    });
    return reply.send({ items: items.map(toView), total });
  };
}

/** Tira de métricas de 7 días (handoff hifi "Acciones remotas") — sin query params. */
function buildSummary(repo: KnexRemoteActionRepository) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await repo.getSummary(new Date()));
  };
}

/** Resultado por tipo de acción + banner de diagnóstico (falla sistémica
 * detectada en el DOMINIO, nunca en el frontend). */
function buildByType(repo: KnexRemoteActionRepository) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    const types = await repo.getByTypeBreakdown(new Date());
    const totalWindow = types.reduce((sum, t) => sum + t.total, 0);
    return reply.send({ window_days: 7, total_7d: totalWindow, types, diagnostic: detectSystemicFailure(types) });
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
        device_id: i.deviceId, device_ip: i.deviceIp, device_label: i.deviceLabel,
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
  fastify.get(`${base}/summary`, { preHandler: portalAuth, handler: buildSummary(repo) });
  fastify.get(`${base}/by-type`, { preHandler: portalAuth, handler: buildByType(repo) });
  fastify.post(base, { preHandler: portalAuth, schema: createSchema, handler: buildCreate(db, repo) });
  fastify.get(`${base}/:id`, { preHandler: portalAuth, schema: idParamSchema, handler: buildDetail(repo) });
  fastify.post(`${base}/:id/cancel`, { preHandler: portalAuth, schema: idParamSchema, handler: buildCancel(repo) });
}
