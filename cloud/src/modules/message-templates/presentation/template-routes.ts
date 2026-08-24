import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import {
  DEFAULT_TEMPLATES,
  EVENT_PLACEHOLDERS,
  TEMPLATE_EVENTS,
  type TemplateEvent,
} from "../domain/entities/message-template";
import { KnexTemplateRepository } from "../infrastructure/database/knex-template-repository";

const upsertSchema = {
  body: {
    type: "object",
    required: ["event", "subject", "body"],
    additionalProperties: false,
    properties: {
      client_id: { type: ["string", "null"], format: "uuid" },
      event: { type: "string", enum: [...TEMPLATE_EVENTS] },
      subject: { type: "string", minLength: 3, maxLength: 200 },
      body: { type: "string", minLength: 3, maxLength: 5000 },
    },
  },
};

const listQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: { client_id: { type: "string", format: "uuid" } },
  },
};

const idParamSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function userIdOf(request: FastifyRequest): string | null {
  const user = (request as FastifyRequest & { user?: { userId?: string } }).user;
  return user?.userId ?? null;
}

/** Vista efectiva por evento: qué se usaría hoy y de dónde sale. */
async function effectiveList(repo: KnexTemplateRepository, clientId: string | null) {
  const own = await repo.list(clientId);
  const globals = clientId ? await repo.list(null) : own;
  return TEMPLATE_EVENTS.map((event) => {
    const ownRow = clientId ? own.find((t) => t.event === event) : undefined;
    const globalRow = globals.find((t) => t.event === event);
    const active = ownRow ?? globalRow;
    return {
      event,
      placeholders: EVENT_PLACEHOLDERS[event],
      source: ownRow ? "client" : globalRow ? "global" : "default",
      id: active?.id ?? null,
      subject: active?.subject ?? DEFAULT_TEMPLATES[event].subject,
      body: active?.body ?? DEFAULT_TEMPLATES[event].body,
      default_subject: DEFAULT_TEMPLATES[event].subject,
      default_body: DEFAULT_TEMPLATES[event].body,
    };
  });
}

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function buildListHandler(repo: KnexTemplateRepository): Handler {
  return async (request, reply) => {
    const { client_id } = request.query as { client_id?: string };
    return reply.send(await effectiveList(repo, client_id ?? null));
  };
}

function buildUpsertHandler(repo: KnexTemplateRepository): Handler {
  return async (request, reply) => {
    const b = request.body as { client_id?: string | null; event: TemplateEvent; subject: string; body: string };
    const saved = await repo.upsert(
      { clientId: b.client_id ?? null, event: b.event, subject: b.subject, body: b.body },
      userIdOf(request)
    );
    return reply.send({ id: saved.id, event: saved.event, subject: saved.subject, body: saved.body });
  };
}

function buildDeleteHandler(repo: KnexTemplateRepository): Handler {
  return async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await repo.delete(id);
    if (!deleted) return reply.status(404).send({ error: "Plantilla no encontrada" });
    return reply.status(204).send();
  };
}

/**
 * Plantillas de mensajes (Fase 4.3 del gap analysis vs HP SDS). Nada en
 * CLIENT_VIEWER_ROUTES: administración pura, deny-by-default.
 */
export function registerMessageTemplateRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const repo = new KnexTemplateRepository(db);
  const base = "/api/v1/message-templates";
  fastify.get(base, { preHandler: portalAuth, schema: listQuerySchema, handler: buildListHandler(repo) });
  fastify.put(base, { preHandler: portalAuth, schema: upsertSchema, handler: buildUpsertHandler(repo) });
  fastify.delete(`${base}/:id`, { preHandler: portalAuth, schema: idParamSchema, handler: buildDeleteHandler(repo) });
}
