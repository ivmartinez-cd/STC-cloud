import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getClientIp } from "../../utils/ip";
import { getScope } from "../../utils/scope";
import { setMonitorState, MonitorStateError } from "../../../services/deviceMonitorService";
import { unignore as unignoreDeviceService, DeviceRegistrationError } from "../../../services/deviceRegistrationService";
import { currentUser } from "./shared";

async function updateMonitorState(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const { state, reason } = request.body as { state?: string; reason?: string };
  if (!state) return reply.status(400).send({ error: "state es requerido" });

  const owned = await db("devices")
    .where({ id })
    .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
    .first();
  if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });

  const user = currentUser(request);
  try {
    const updated = await setMonitorState(db, {
      deviceId: id, state, reason, actorId: user?.userId ?? null, ip: getClientIp(request),
    });
    if (!updated) return reply.status(404).send({ error: "Dispositivo no encontrado" });
    return updated;
  } catch (err) {
    if (err instanceof MonitorStateError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

// Fase 7 del gap analysis vs HP SDS — devuelve un equipo `ignored` a `pending`.
async function unignoreDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const { reason } = (request.body as { reason?: string } | undefined) ?? {};

  const owned = await db("devices")
    .where({ id })
    .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
    .first();
  if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });

  const user = currentUser(request);
  try {
    const updated = await unignoreDeviceService(db, {
      deviceId: id, reason, actorId: user?.userId ?? null, ip: getClientIp(request),
    });
    if (!updated) return reply.status(404).send({ error: "Dispositivo no encontrado" });
    return updated;
  } catch (err) {
    if (err instanceof DeviceRegistrationError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

export function createDeviceMonitorStateHandlers(db: Knex) {
  return {
    updateMonitorState: (request: FastifyRequest, reply: FastifyReply) => updateMonitorState(db, request, reply),
    unignoreDevice: (request: FastifyRequest, reply: FastifyReply) => unignoreDevice(db, request, reply),
  };
}
