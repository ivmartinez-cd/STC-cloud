import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import * as apiKeyService from "../../../services/apiKeyService";

async function listApiKeys(db: Knex, request: FastifyRequest) {
  const { id } = request.params as { id: string };
  return apiKeyService.listApiKeys(db, id);
}

async function createApiKey(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { name } = request.body as { name?: string };
  if (!name?.trim()) return reply.status(400).send({ error: "name es requerido" });
  const created = await apiKeyService.createApiKey(db, id, name.trim());
  // El valor en claro se devuelve UNA sola vez acá — no se puede recuperar después.
  return reply.status(201).send(created);
}

async function revokeApiKey(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id, keyId } = request.params as { id: string; keyId: string };
  const updated = await apiKeyService.revokeApiKey(db, id, keyId);
  if (updated === 0) return reply.status(404).send({ error: "API key no encontrada o ya revocada" });
  return { ok: true };
}

export function createClientApiKeyHandlers(db: Knex) {
  return {
    listApiKeys: (request: FastifyRequest) => listApiKeys(db, request),
    createApiKey: (request: FastifyRequest, reply: FastifyReply) => createApiKey(db, request, reply),
    revokeApiKey: (request: FastifyRequest, reply: FastifyReply) => revokeApiKey(db, request, reply),
  };
}
