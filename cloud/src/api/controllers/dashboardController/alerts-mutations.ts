import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getScope } from "../../utils/scope";
import { getClientIp } from "../../utils/ip";
import { writeAudit } from "../../../services/auditService";

async function updateAlert(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { acknowledged, resolved } = request.body as { acknowledged?: boolean; resolved?: boolean };
  const scope = getScope(request);
  const currentUser = (request as FastifyRequest & { user: PortalUser }).user;

  const alert = await db("alerts")
    .leftJoin("devices", "alerts.device_id", "devices.id")
    .leftJoin("agents", "agents.id", db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
    .modify((q) => {
      // Nunca debería llegar acá con scope "client": client_viewer no tiene esta
      // ruta en su allowlist (rolePolicy.ts) y recibe 403 antes de esto. Se deja
      // igual el chequeo de propiedad como defensa en profundidad, no confiar
      // sólo en el gate de autorización para una mutación.
      if (scope.kind === "client") {
        q.andWhere((b) => {
          b.where("devices.client_id", scope.id).orWhere((b2) => {
            b2.whereNull("devices.id").andWhere("agents.client_id", scope.id);
          });
        });
      }
    })
    .select("alerts.id")
    .where("alerts.id", id)
    .first();
  if (!alert) return reply.status(404).send({ error: "Alerta no encontrada" });

  // Whitelist explícito — nunca `request.body` completo (mismo criterio que
  // `createClient`/`updateUser`).
  const updates: Record<string, unknown> = {};
  if (acknowledged !== undefined) {
    updates.acknowledged = acknowledged;
    updates.ack_by = acknowledged ? currentUser?.userId ?? null : null;
    updates.ack_at = acknowledged ? new Date() : null;
  }
  if (resolved !== undefined) {
    updates.resolved = resolved;
    updates.resolved_at = resolved ? new Date() : null;
  }
  if (Object.keys(updates).length === 0) {
    return reply.status(400).send({ error: "Nada para actualizar: se espera acknowledged y/o resolved" });
  }

  const [updated] = await db("alerts").where({ id }).update(updates).returning([
    "id", "acknowledged", "ack_by", "ack_at", "resolved", "resolved_at",
  ]);

  await db("audit_logs").insert({
    action: acknowledged !== undefined && resolved !== undefined
      ? "ALERT_ACK_AND_RESOLVE"
      : acknowledged !== undefined ? "ALERT_ACKNOWLEDGED" : "ALERT_RESOLVED",
    target_id: String(id),
    user_id: currentUser?.userId ?? null,
    ip_address: getClientIp(request),
    metadata: JSON.stringify({ acknowledged, resolved }),
  });

  return updated;
}

function buildAlertUpdates(currentUser: PortalUser | undefined, acknowledged?: boolean, resolved?: boolean) {
  const updates: Record<string, unknown> = {};
  if (acknowledged !== undefined) {
    updates.acknowledged = acknowledged;
    updates.ack_by = acknowledged ? currentUser?.userId ?? null : null;
    updates.ack_at = acknowledged ? new Date() : null;
  }
  if (resolved !== undefined) {
    updates.resolved = resolved;
    updates.resolved_at = resolved ? new Date() : null;
  }
  return updates;
}

async function findOwnedAlertIds(db: Knex, ids: number[], scope: ReturnType<typeof getScope>) {
  const owned = await db("alerts")
    .leftJoin("devices", "alerts.device_id", "devices.id")
    .leftJoin("agents", "agents.id", db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
    .whereIn("alerts.id", ids)
    .modify((q) => {
      if (scope.kind === "client") {
        q.andWhere((b) => {
          b.where("devices.client_id", scope.id).orWhere((b2) => {
            b2.whereNull("devices.id").andWhere("agents.client_id", scope.id);
          });
        });
      }
    })
    .select("alerts.id");
  return owned.map((r: { id: number }) => r.id);
}

// Fase 9 del gap analysis vs HP SDS — acción en bloque, mismo whitelist de
// campos y mismo criterio de ownership que `updateAlert` de arriba, pero
// sobre una lista de ids en vez de uno solo. Deliberadamente NO acepta "todo
// lo que matchea el filtro actual" — sólo ids explícitos que el cliente ya
// tiene en pantalla, para que un usuario nunca reconozca/resuelva alertas
// que no llegó a ver.
async function bulkUpdateAlerts(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { ids, acknowledged, resolved } = request.body as { ids?: number[]; acknowledged?: boolean; resolved?: boolean };
  if (!Array.isArray(ids) || ids.length === 0) return reply.status(400).send({ error: "ids es requerido" });
  if (ids.length > 500) return reply.status(400).send({ error: "ids no puede tener más de 500 elementos" });
  const currentUser = (request as FastifyRequest & { user: PortalUser }).user;
  const updates = buildAlertUpdates(currentUser, acknowledged, resolved);
  if (Object.keys(updates).length === 0) {
    return reply.status(400).send({ error: "Nada para actualizar: se espera acknowledged y/o resolved" });
  }

  const scope = getScope(request);
  const ownedIds = await findOwnedAlertIds(db, ids, scope);
  const skipped = ids.filter((id) => !ownedIds.includes(id)).map((id) => ({ id, reason: "not_found" }));

  let applied: number[] = [];
  if (ownedIds.length > 0) {
    await db.transaction(async (trx) => {
      await trx("alerts").whereIn("id", ownedIds).update(updates);
      await writeAudit(trx, {
        action: "ALERTS_BULK_UPDATED",
        targetId: null,
        userId: currentUser?.userId ?? null,
        ip: getClientIp(request),
        metadata: { alert_ids: ownedIds, count: ownedIds.length, acknowledged, resolved },
      });
    });
    applied = ownedIds;
  }

  return { count: applied.length, applied, skipped };
}

export function createDashboardAlertMutationHandlers(db: Knex) {
  return {
    updateAlert: (request: FastifyRequest, reply: FastifyReply) => updateAlert(db, request, reply),
    bulkUpdateAlerts: (request: FastifyRequest, reply: FastifyReply) => bulkUpdateAlerts(db, request, reply),
  };
}
