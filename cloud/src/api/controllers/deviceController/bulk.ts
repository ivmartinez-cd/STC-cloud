import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getClientIp } from "../../utils/ip";
import { getScope } from "../../utils/scope";
import {
  bulkDecommission, bulkRecommission, bulkMove, BulkActionError, type BulkScope,
} from "../../../services/deviceLifecycleService";
import { setMonitorState, MonitorStateError } from "../../../services/deviceMonitorService";
import { currentUser } from "./shared";

async function bulkDecommissionDevices(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { ids, reason, dryRun } = request.body as { ids?: string[]; reason?: string; dryRun?: boolean };
  const scope: BulkScope = getScope(request);
  const user = currentUser(request);
  try {
    return await bulkDecommission(db, { ids: ids ?? [], reason: reason ?? "", scope, actorId: user?.userId ?? null, ip: getClientIp(request), dryRun });
  } catch (err) {
    if (err instanceof BulkActionError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

async function bulkRecommissionDevices(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { ids, reason } = request.body as { ids?: string[]; reason?: string };
  const scope: BulkScope = getScope(request);
  const user = currentUser(request);
  try {
    return await bulkRecommission(db, { ids: ids ?? [], reason, scope, actorId: user?.userId ?? null, ip: getClientIp(request) });
  } catch (err) {
    if (err instanceof BulkActionError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

async function bulkMoveDevices(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { ids, agentId, reason, confirmClientChange } = request.body as {
    ids?: string[]; agentId?: string; reason?: string; confirmClientChange?: boolean;
  };
  const scope: BulkScope = getScope(request);
  const user = currentUser(request);
  try {
    return await bulkMove(db, {
      ids: ids ?? [], agentId: agentId ?? "", reason: reason ?? "", confirmClientChange,
      scope, actorId: user?.userId ?? null, ip: getClientIp(request),
    });
  } catch (err) {
    if (err instanceof BulkActionError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

async function bulkSetMonitorState(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { ids, state, reason } = request.body as { ids?: string[]; state?: string; reason?: string };
  if (!Array.isArray(ids) || ids.length === 0) return reply.status(400).send({ error: "ids es requerido" });
  if (ids.length > 500) return reply.status(400).send({ error: "ids no puede tener más de 500 elementos" });
  if (!state) return reply.status(400).send({ error: "state es requerido" });

  const scope = getScope(request);
  const owned = await db("devices").whereIn("id", ids)
    .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
    .select("id");
  const ownedIds = new Set(owned.map((r: { id: string }) => r.id));

  const user = currentUser(request);
  const applied: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const id of ids) {
    if (!ownedIds.has(id)) { skipped.push({ id, reason: "not_found" }); continue; }
    try {
      const updated = await setMonitorState(db, { deviceId: id, state, reason, actorId: user?.userId ?? null, ip: getClientIp(request) });
      if (!updated) { skipped.push({ id, reason: "not_found" }); continue; }
      applied.push(id);
    } catch (err) {
      // `state` inválido es el MISMO para todos los ids del lote — recién
      // puede pasar en la primera iteración (antes de mutar nada), así que
      // abortar con 400 acá es seguro (cero escritura parcial). "Fusionado"
      // (409) SÍ es por-dispositivo — no aborta el resto del lote.
      if (err instanceof MonitorStateError) {
        if (err.statusCode === 409) { skipped.push({ id, reason: "merged" }); continue; }
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  }
  return { count: applied.length, applied, skipped };
}

// ─── Acciones en bloque (Fase 9 del gap analysis vs HP SDS) ────────────
// Ninguna en CLIENT_VIEWER_ROUTES — deny-by-default. Cada handler re-scopea
// los `ids` en `deviceLifecycleService` (un id ajeno vuelve `skipped`, nunca
// 404 para toda la llamada).
export function createDeviceBulkHandlers(db: Knex) {
  return {
    bulkDecommissionDevices: (request: FastifyRequest, reply: FastifyReply) => bulkDecommissionDevices(db, request, reply),
    bulkRecommissionDevices: (request: FastifyRequest, reply: FastifyReply) => bulkRecommissionDevices(db, request, reply),
    bulkMoveDevices: (request: FastifyRequest, reply: FastifyReply) => bulkMoveDevices(db, request, reply),
    bulkSetMonitorState: (request: FastifyRequest, reply: FastifyReply) => bulkSetMonitorState(db, request, reply),
  };
}
