import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { EMAIL_STATUSES } from "../domain/entities/email-log-entry";
import { KnexEmailLogRepository } from "../infrastructure/database/knex-email-log-repository";

const listQuerySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      client_id: { type: "string", format: "uuid" },
      event: { type: "string", maxLength: 50 },
      status: { type: "string", enum: [...EMAIL_STATUSES] },
      q: { type: "string", maxLength: 200 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      offset: { type: "integer", minimum: 0 },
    },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildListHandler(repo: KnexEmailLogRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as Record<string, any>;
    const { items, total } = await repo.list({
      clientId: q.client_id, event: q.event, status: q.status, q: q.q,
      limit: q.limit ?? 50, offset: q.offset ?? 0,
    });
    return reply.send({
      items: items.map((e) => ({
        id: e.id, client_id: e.clientId, event: e.event, recipient: e.recipient,
        subject: e.subject, status: e.status, error: e.error, metadata: e.metadata,
        created_at: new Date(e.createdAt).toISOString(),
      })),
      total,
    });
  };
}

/**
 * Registro de auditoría de correo (Fase 4.4 del gap analysis vs HP SDS).
 * Solo lectura; nada en CLIENT_VIEWER_ROUTES (mismo criterio que
 * /audit-logs: metadata libre, admin/operator).
 */
export function registerEmailLogRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const repo = new KnexEmailLogRepository(db);
  fastify.get("/api/v1/email-log", {
    preHandler: portalAuth, schema: listQuerySchema, handler: buildListHandler(repo),
  });
}
