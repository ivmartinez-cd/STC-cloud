import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getWebhookConfig, upsertWebhookConfig, type PublicApiEvent } from "../../../services/publicWebhookService";

const VALID_WEBHOOK_EVENTS: PublicApiEvent[] = ["reading.created", "alert.created", "report.closed"];

// Gestión del webhook de la API pública (`api_webhooks`) desde el portal —
// reusa el mismo service que `/api/v1/public/webhook` (autenticado por API
// key), acá scopeado por :id de la URL en vez de por el cliente resuelto
// desde la key. Sin esto, un admin no tenía forma de configurar el webhook
// sin ya tener una key generada (huevo y gallina).
async function getWebhook(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const config = await getWebhookConfig(db, id);
  if (!config) return reply.status(404).send({ error: "Sin webhook configurado" });
  return config;
}

async function putWebhook(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as { url?: string; events?: string[]; active?: boolean; regenerate_secret?: boolean };
  if (body.events && !body.events.every((e) => VALID_WEBHOOK_EVENTS.includes(e as PublicApiEvent))) {
    return reply.status(400).send({ error: `events debe ser subconjunto de ${VALID_WEBHOOK_EVENTS.join(", ")}` });
  }
  const config = await upsertWebhookConfig(db, id, {
    url: body.url,
    events: body.events as PublicApiEvent[] | undefined,
    active: body.active,
    regenerateSecret: body.regenerate_secret,
  });
  return config;
}

export function createClientWebhookHandlers(db: Knex) {
  return {
    getWebhook: (request: FastifyRequest, reply: FastifyReply) => getWebhook(db, request, reply),
    putWebhook: (request: FastifyRequest, reply: FastifyReply) => putWebhook(db, request, reply),
  };
}
