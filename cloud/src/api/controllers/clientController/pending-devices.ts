import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getClientIp } from "../../utils/ip";
import * as deviceRegistrationService from "../../../services/deviceRegistrationService";
import { DeviceRegistrationError } from "../../../services/deviceRegistrationService";

// ─── Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS) ──

async function listPendingDevices(db: Knex, request: FastifyRequest) {
  const { id } = request.params as { id: string };
  const { limit, offset, q, agent_id } = request.query as { limit?: string; offset?: string; q?: string; agent_id?: string };
  return deviceRegistrationService.listPending(db, {
    clientId: id,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
    q, agentId: agent_id,
  });
}

async function registerPendingDevices(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { deviceIds } = request.body as { deviceIds?: string[] };
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return reply.status(400).send({ error: "deviceIds es requerido" });
  }
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  try {
    return await deviceRegistrationService.registerDevices(db, {
      clientId: id, deviceIds, actorId: user?.userId ?? null, ip: getClientIp(request),
    });
  } catch (err) {
    if (err instanceof DeviceRegistrationError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

async function ignorePendingDevices(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { deviceIds, reason } = request.body as { deviceIds?: string[]; reason?: string };
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return reply.status(400).send({ error: "deviceIds es requerido" });
  }
  if (!reason?.trim()) return reply.status(400).send({ error: "reason es requerido" });
  const user = (request as FastifyRequest & { user: PortalUser }).user;
  try {
    return await deviceRegistrationService.ignoreDevices(db, {
      clientId: id, deviceIds, reason, actorId: user?.userId ?? null, ip: getClientIp(request),
    });
  } catch (err) {
    if (err instanceof DeviceRegistrationError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

export function createClientPendingDeviceHandlers(db: Knex) {
  return {
    listPendingDevices: (request: FastifyRequest) => listPendingDevices(db, request),
    registerPendingDevices: (request: FastifyRequest, reply: FastifyReply) => registerPendingDevices(db, request, reply),
    ignorePendingDevices: (request: FastifyRequest, reply: FastifyReply) => ignorePendingDevices(db, request, reply),
  };
}
