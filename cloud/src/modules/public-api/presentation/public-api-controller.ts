import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { ApiKeyClient } from "../../../api/middlewares/authMiddleware";
import { NotFoundError, ValidationError } from "../../../shared/domain/errors";
import { KnexPublicApiRepository } from "../infrastructure/database/knex-public-api-repository";
import { KnexPublicWebhookConfigAdapter } from "../infrastructure/adapters/knex-public-webhook-config-adapter";
import {
  ListPublicDevicesUseCase, GetPublicDeviceReadingsUseCase, ListPublicAlertsUseCase,
  ListPublicReportClosuresUseCase, GetPublicReportClosureUseCase,
} from "../application/use-cases/public-api-read-use-cases";
import { GetPublicWebhookUseCase, PutPublicWebhookUseCase } from "../application/use-cases/public-api-webhook-use-cases";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIdOf(request: FastifyRequest): string {
  return (request as FastifyRequest & { apiKeyClient: ApiKeyClient }).apiKeyClient.clientId;
}

function pageParams(request: FastifyRequest, defaultLimit = 100, maxLimit = 500) {
  const { limit, offset } = request.query as { limit?: string; offset?: string };
  return {
    limit: Math.min(Number(limit) || defaultLimit, maxLimit),
    offset: Math.max(Number(offset) || 0, 0),
  };
}

function sendIfPublicApiError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof NotFoundError) { reply.status(404).send({ error: error.message }); return true; }
  if (error instanceof ValidationError) { reply.status(400).send({ error: error.message }); return true; }
  return false;
}

/**
 * API pública (integración ERP) — scope SIEMPRE fijo al cliente de la API
 * key, nunca "todos" (a diferencia de `scope.ts`/`getScope`, pensado para
 * portalAuth/roles de portal, no reusable acá porque una API key no es un
 * `PortalUser`). Controladores propios y deliberadamente más simples que sus
 * equivalentes de portal — sin la lógica de admin/operator/client_viewer.
 * Migrado a módulo con capas completas en la tanda 2026-08-27.
 */
export function createPublicApiController(db: Knex) {
  const repo = new KnexPublicApiRepository(db);
  const listDevices = new ListPublicDevicesUseCase(repo);
  const getDeviceReadings = new GetPublicDeviceReadingsUseCase(repo);
  const listAlerts = new ListPublicAlertsUseCase(repo);
  const listReportClosures = new ListPublicReportClosuresUseCase(repo);
  const getReportClosure = new GetPublicReportClosureUseCase(repo);
  const webhookConfig = new KnexPublicWebhookConfigAdapter(db);
  const getWebhook = new GetPublicWebhookUseCase(webhookConfig);
  const putWebhook = new PutPublicWebhookUseCase(webhookConfig);

  return {
    listDevices: async (request: FastifyRequest) => {
      return listDevices.execute(clientIdOf(request), pageParams(request));
    },

    getDeviceReadings: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return reply.status(400).send({ error: "id inválido" });

      const { from, to, limit } = request.query as { from?: string; to?: string; limit?: string };
      try {
        return await getDeviceReadings.execute(clientIdOf(request), id, {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          limit: Math.min(Number(limit) || 500, 5000),
        });
      } catch (err) {
        if (sendIfPublicApiError(reply, err)) return reply;
        throw err;
      }
    },

    listAlerts: async (request: FastifyRequest) => {
      const { resolved } = request.query as { resolved?: string };
      return listAlerts.execute(clientIdOf(request), { resolved: resolved !== undefined ? resolved === "true" : undefined }, pageParams(request));
    },

    listReportClosures: async (request: FastifyRequest) => {
      return listReportClosures.execute(clientIdOf(request), pageParams(request));
    },

    getReportClosure: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        return await getReportClosure.execute(clientIdOf(request), id);
      } catch (err) {
        if (sendIfPublicApiError(reply, err)) return reply;
        throw err;
      }
    },

    getWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await getWebhook.execute(clientIdOf(request));
      } catch (err) {
        if (sendIfPublicApiError(reply, err)) return reply;
        throw err;
      }
    },

    putWebhook: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { url?: string; events?: string[]; active?: boolean; regenerate_secret?: boolean };
      try {
        return await putWebhook.execute(clientIdOf(request), {
          url: body.url, events: body.events, active: body.active, regenerateSecret: body.regenerate_secret,
        });
      } catch (err) {
        if (sendIfPublicApiError(reply, err)) return reply;
        throw err;
      }
    },
  };
}
