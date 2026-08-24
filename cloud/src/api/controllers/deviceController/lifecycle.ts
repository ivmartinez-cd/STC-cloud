import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getClientIp } from "../../utils/ip";
import { getScope } from "../../utils/scope";
import { onlyLiveDevices } from "../../utils/deviceFilters";
import { writeAudit } from "../../../services/auditService";
import { currentUser } from "./shared";

async function decommissionDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const { reason } = request.body as { reason?: string };
  if (!reason || !reason.trim()) {
    return reply.status(400).send({ error: "El motivo es obligatorio" });
  }

  const user = currentUser(request);
  try {
    const result = await db.transaction(async (trx) => {
      const device = await trx("devices")
        .where({ id })
        .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
        .forUpdate()
        .first();
      if (!device) throw { status: 404, error: "Dispositivo no encontrado" };
      if (device.merged_into) throw { status: 409, error: "Un registro fusionado no se puede dar de baja" };
      if (device.decommissioned_at) return device; // idempotente

      const [updated] = await trx("devices").where({ id }).update({
        decommissioned_at: new Date(),
        decommissioned_by: user?.userId ?? null,
        decommission_reason: reason.trim(),
        active: false,
      }).returning("*");

      // Resolver TODAS sus alertas abiertas en la misma transacción: si no,
      // `device_offline` queda abierta para siempre (su resolución exige
      // last_seen >= cutoff, que un equipo dado de baja nunca vuelve a
      // cumplir) y una alerta crítica reabierta seguiría notificando al
      // cliente por un equipo que ya retiró.
      const alertsResolved = await trx("alerts")
        .where({ device_id: id, resolved: false })
        .update({ resolved: true, resolved_at: new Date() });

      await writeAudit(trx, {
        action: "DEVICE_DECOMMISSIONED",
        targetId: String(id),
        clientId: device.client_id,
        userId: user?.userId ?? null,
        ip: getClientIp(request),
        metadata: {
          serial_number: device.serial_number, mac: device.mac, ip_address: device.ip_address,
          agent_id: device.agent_id, client_id: device.client_id, last_seen: device.last_seen,
          total_pages: device.total_pages, reason: reason.trim(), alerts_resolved: alertsResolved,
        },
      });

      return updated;
    });
    return result;
  } catch (e: any) {
    if (e?.status) return reply.status(e.status).send({ error: e.error });
    throw e;
  }
}

async function recommissionDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const { reason } = request.body as { reason?: string };

  const device = await db("devices")
    .where({ id })
    .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
    .first();
  if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
  if (device.merged_into) return reply.status(409).send({ error: "Un registro fusionado no se puede reactivar" });

  const [updated] = await db("devices").where({ id }).update({
    decommissioned_at: null, decommissioned_by: null, decommission_reason: null,
  }).returning("*");

  const user = currentUser(request);
  await writeAudit(db, {
    action: "DEVICE_RECOMMISSIONED",
    targetId: String(id),
    clientId: device.client_id,
    userId: user?.userId ?? null,
    ip: getClientIp(request),
    metadata: { reason: reason?.trim() || null },
  });
  return updated;
}

async function moveDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const { agentId, reason, confirmClientChange } = request.body as {
    agentId?: string; reason?: string; confirmClientChange?: boolean;
  };
  if (!agentId) return reply.status(400).send({ error: "agentId es requerido" });
  if (!reason || !reason.trim()) return reply.status(400).send({ error: "El motivo es obligatorio" });

  const user = currentUser(request);
  try {
    const result = await db.transaction(async (trx) => {
      const device = await trx("devices")
        .where({ id })
        .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
        .forUpdate()
        .first();
      if (!device) throw { status: 404, error: "Dispositivo no encontrado" };
      if (device.merged_into) throw { status: 409, error: "Un registro fusionado no se puede mover" };

      const targetAgent = await trx("agents").where({ id: agentId }).first();
      if (!targetAgent || targetAgent.status === "revoked") throw { status: 404, error: "Monitor destino no encontrado" };
      if (scope.kind === "client" && targetAgent.client_id !== scope.id) {
        throw { status: 404, error: "Monitor destino no encontrado" };
      }
      if (agentId === device.agent_id) throw { status: 400, error: "El equipo ya pertenece a ese monitor" };

      const clientChanged = targetAgent.client_id !== device.client_id;
      if (clientChanged && !confirmClientChange) {
        throw { status: 400, error: "Cambiar de cliente requiere confirmClientChange: true" };
      }

      // client_id se DERIVA del agente destino, nunca del body: tocar uno y
      // no el otro deja al equipo visible para dos clientes a la vez.
      if (device.serial_number) {
        const collision = await trx("devices")
          .where("client_id", targetAgent.client_id)
          .whereRaw("upper(btrim(serial_number)) = upper(?)", [device.serial_number])
          .whereNot("id", device.id)
          .whereNull("merged_into")
          .first();
        if (collision) {
          throw {
            status: 409,
            error: "Ya existe este equipo en el cliente destino — usá Fusionar",
            collisionId: collision.id,
          };
        }
      }

      const [updated] = await trx("devices").where({ id }).update({
        agent_id: agentId,
        client_id: targetAgent.client_id,
        agent_reassigned_at: new Date(),
      }).returning("*");

      // Las alertas abiertas cruzarían de tenant al mover (getAlerts scopea
      // por devices.client_id) y pueden contener datos del sitio anterior.
      const alertsResolved = await trx("alerts")
        .where({ device_id: id, resolved: false })
        .update({ resolved: true, resolved_at: new Date() });

      // client_id = el DESTINO (targetAgent.client_id) — es donde el equipo
      // vive ahora, así que es bajo ese cliente que el feed debe mostrar el
      // movimiento.
      await writeAudit(trx, {
        action: "DEVICE_MOVED",
        targetId: String(id),
        clientId: targetAgent.client_id,
        userId: user?.userId ?? null,
        ip: getClientIp(request),
        metadata: {
          from_agent_id: device.agent_id, to_agent_id: agentId,
          from_client_id: device.client_id, to_client_id: targetAgent.client_id,
          client_changed: clientChanged, reason: reason.trim(), alerts_resolved: alertsResolved,
        },
      });

      return updated;
    });
    return result;
  } catch (e: any) {
    if (e?.status) return reply.status(e.status).send({ error: e.error, ...(e.collisionId ? { collisionId: e.collisionId } : {}) });
    throw e;
  }
}

// `DELETE /devices/offline` (borrado en duro por agent_id de query param,
// sin ownership, con `active=false` como criterio) fue REEMPLAZADO por
// `decommissionStaleDevices` de abajo, colgado de /agents/:id — hereda el
// chequeo central de ownership, dado de baja en vez de borrado, dry-run,
// y devuelve siempre la lista completa en vez de sólo el conteo.
async function decommissionStaleDevices(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id: agentId } = request.params as { id: string };
  const { inactiveDays, dryRun, reason } = request.body as {
    inactiveDays?: number; dryRun?: boolean; reason?: string;
  };
  const days = Math.min(365, Math.max(7, inactiveDays ?? 30));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const targets = await db("devices")
    .where("agent_id", agentId)
    .modify((q) => onlyLiveDevices(q, "devices"))
    .whereRaw("COALESCE(last_seen, created_at) < ?", [cutoff])
    .select("id", "serial_number", "model", "ip_address", "last_seen", "client_id");

  if (dryRun) {
    return { count: targets.length, devices: targets };
  }
  if (targets.length === 0) {
    return { count: 0, devices: [] };
  }

  const ids = targets.map((t: { id: string }) => t.id);
  const user = currentUser(request);
  await db.transaction(async (trx) => {
    await trx("devices").whereIn("id", ids).update({
      decommissioned_at: new Date(),
      decommissioned_by: user?.userId ?? null,
      decommission_reason: reason?.trim() || `Sin actividad por ${days} días (purga automática)`,
      active: false,
    });
    await trx("alerts").whereIn("device_id", ids).where("resolved", false).update({
      resolved: true, resolved_at: new Date(),
    });
    await writeAudit(trx, {
      action: "DEVICES_BULK_DECOMMISSIONED",
      targetId: agentId,
      clientId: targets[0]?.client_id ?? null,
      userId: user?.userId ?? null,
      ip: getClientIp(request),
      metadata: { agent_id: agentId, inactive_days: days, count: ids.length, device_ids: ids, reason: reason?.trim() || null },
    });
  });

  return { count: ids.length, devices: targets };
}

export function createDeviceLifecycleHandlers(db: Knex) {
  return {
    decommissionDevice: (request: FastifyRequest, reply: FastifyReply) => decommissionDevice(db, request, reply),
    recommissionDevice: (request: FastifyRequest, reply: FastifyReply) => recommissionDevice(db, request, reply),
    moveDevice: (request: FastifyRequest, reply: FastifyReply) => moveDevice(db, request, reply),
    decommissionStaleDevices: (request: FastifyRequest, reply: FastifyReply) => decommissionStaleDevices(db, request, reply),
  };
}
