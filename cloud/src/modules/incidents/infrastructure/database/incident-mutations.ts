import { Knex } from "knex";
import { IncidentError } from "../../domain/errors/incident-error";
import { INCIDENT_STATUSES, type IncidentStatus } from "../../domain/entities/incident-status";
import type { CreateIncidentParams } from "../../domain/repositories/incident-repository";
import { writeEvent } from "./incident-events";

async function deviceSnapshot(db: Knex | Knex.Transaction, deviceId: string | null | undefined) {
  if (!deviceId) return { agentId: null, serial: null, label: null };
  const device = await db("devices").leftJoin("agents", "agents.id", "devices.agent_id")
    .where("devices.id", deviceId)
    .select("devices.agent_id", "devices.serial_number", "devices.name_reported", "devices.model")
    .first();
  if (!device) return { agentId: null, serial: null, label: null };
  return {
    agentId: device.agent_id ?? null,
    serial: device.serial_number ?? null,
    label: device.name_reported || device.model || null,
  };
}

export async function createIncident(db: Knex, params: CreateIncidentParams): Promise<any> {
  if (params.alertIds && params.alertIds.length > 50) {
    throw new IncidentError("alert_ids no puede tener más de 50 elementos");
  }
  return db.transaction(async (trx) => {
    const snap = await deviceSnapshot(trx, params.deviceId);
    const [row] = await trx("incidents")
      .insert({
        client_id: params.clientId,
        device_id: params.deviceId ?? null,
        agent_id: snap.agentId,
        device_serial: snap.serial,
        device_label: snap.label,
        class: params.klass,
        title: (params.title?.trim() || `Incidente — ${params.klass}`).slice(0, 200),
        description: params.description ?? null,
        severity: params.severity ?? "critical",
        origin: "manual",
        external_id: params.externalId ?? null,
        created_by: params.actorId ?? null,
      })
      .returning("*");

    await writeEvent(trx, { incidentId: row.id, kind: "status_change", body: "Incidente creado (abierto)", userId: params.actorId });

    if (params.alertIds?.length) {
      for (const alertId of params.alertIds) {
        await trx("incident_alerts").insert({ incident_id: row.id, alert_id: alertId, linked_by: params.actorId ?? null })
          .onConflict(["incident_id", "alert_id"]).ignore();
        await writeEvent(trx, { incidentId: row.id, kind: "link_alert", metadata: { alert_id: alertId }, userId: params.actorId });
      }
    }
    return row;
  });
}

const PATCH_FIELDS = ["title", "description", "external_id", "class", "severity", "assigned_to", "sla_due_at"] as const;

export async function updateIncident(db: Knex, id: string, patch: Record<string, unknown>, actorId?: string | null): Promise<any | null> {
  const updates: Record<string, unknown> = {};
  for (const f of PATCH_FIELDS) {
    if (patch[f] !== undefined) updates[f] = patch[f];
  }
  if (Object.keys(updates).length === 0) throw new IncidentError("Nada para actualizar");
  updates.updated_at = new Date();

  const [row] = await db("incidents").where({ id }).update(updates).returning("*");
  if (!row) return null;
  await writeEvent(db, { incidentId: id, kind: "status_change", body: `Campos actualizados: ${Object.keys(updates).join(", ")}`, userId: actorId, metadata: { fields: Object.keys(updates) } });
  return row;
}

export async function setStatus(db: Knex, id: string, status: IncidentStatus, actorId?: string | null): Promise<any | null> {
  if (!INCIDENT_STATUSES.includes(status)) throw new IncidentError(`status inválido: debe ser uno de ${INCIDENT_STATUSES.join(", ")}`);
  const existing = await db("incidents").where({ id }).first();
  if (!existing) return null;
  if (existing.status === "closed") throw new IncidentError("El incidente está cerrado — usá reopen para reabrirlo", 409);

  const updates: Record<string, unknown> = { status, updated_at: new Date() };
  if (status !== "open" && !existing.first_response_at) updates.first_response_at = new Date();

  const [row] = await db("incidents").where({ id }).update(updates).returning("*");
  await writeEvent(db, { incidentId: id, kind: "status_change", body: `${existing.status} → ${status}`, userId: actorId });
  return row;
}

export async function closeIncident(db: Knex, id: string, params: { reason?: string | null; actorId?: string | null }): Promise<any | null> {
  const existing = await db("incidents").where({ id }).first();
  if (!existing) return null;
  if (existing.status === "closed") return existing; // idempotente

  const [row] = await db("incidents").where({ id }).update({
    status: "closed", closed_at: new Date(), closed_by: params.actorId ?? null,
    close_reason: params.reason?.trim() || null, updated_at: new Date(),
  }).returning("*");
  await writeEvent(db, { incidentId: id, kind: "status_change", body: "Cerrado", userId: params.actorId, metadata: { reason: params.reason ?? null } });
  return row;
}

/**
 * Reabrir: si el incidente es `auto` y ya existe OTRO incidente abierto para
 * el mismo `(device_id, class)` (alguien lo cerró y mientras tanto el
 * worker abrió uno nuevo para la misma alerta persistente), reabrir
 * colisionaría con `incidents_open_device_class_uniq` — se responde 409 con
 * el id en conflicto en vez de dejar que el INSERT/UPDATE reviente con un
 * error de Postgres crudo.
 */
export async function reopenIncident(db: Knex, id: string, params: { reason?: string | null; actorId?: string | null }): Promise<any | null> {
  const existing = await db("incidents").where({ id }).first();
  if (!existing) return null;
  if (existing.status !== "closed") throw new IncidentError("El incidente no está cerrado", 409);

  if (existing.origin === "auto" && existing.device_id) {
    const conflict = await db("incidents")
      .where({ device_id: existing.device_id, class: existing.class, origin: "auto" })
      .whereNot("status", "closed")
      .whereNot("id", id)
      .first();
    if (conflict) {
      const err = new IncidentError("Ya existe un incidente automático abierto para este equipo y clase", 409);
      err.conflictId = conflict.id;
      throw err;
    }
  }

  const [row] = await db("incidents").where({ id }).update({
    status: "open", closed_at: null, closed_by: null, close_reason: null,
    reopened_count: existing.reopened_count + 1, updated_at: new Date(),
  }).returning("*");
  await writeEvent(db, { incidentId: id, kind: "reopen", body: params.reason ?? null, userId: params.actorId });
  return row;
}

export async function addComment(db: Knex, id: string, params: { body: string; actorId?: string | null }): Promise<void | null> {
  const existing = await db("incidents").where({ id }).select("id").first();
  if (!existing) return null;
  await writeEvent(db, { incidentId: id, kind: "comment", body: params.body, userId: params.actorId });
}

export async function assignIncident(db: Knex, id: string, params: { userId: string | null; actorId?: string | null }): Promise<any | null> {
  const [row] = await db("incidents").where({ id }).update({ assigned_to: params.userId, updated_at: new Date() }).returning("*");
  if (!row) return null;
  await writeEvent(db, { incidentId: id, kind: "assign", metadata: { assigned_to: params.userId }, userId: params.actorId });
  return row;
}

export async function linkAlert(db: Knex, id: string, alertId: number, actorId?: string | null): Promise<boolean> {
  const incident = await db("incidents").where({ id }).select("id").first();
  if (!incident) return false;
  const alert = await db("alerts").where({ id: alertId }).select("id").first();
  if (!alert) throw new IncidentError("Alerta no encontrada", 404);
  await db("incident_alerts").insert({ incident_id: id, alert_id: alertId, linked_by: actorId ?? null })
    .onConflict(["incident_id", "alert_id"]).ignore();
  await writeEvent(db, { incidentId: id, kind: "link_alert", metadata: { alert_id: alertId }, userId: actorId });
  return true;
}

export async function unlinkAlert(db: Knex, id: string, alertId: number, actorId?: string | null): Promise<boolean> {
  const deleted = await db("incident_alerts").where({ incident_id: id, alert_id: alertId }).del();
  if (deleted === 0) return false;
  await writeEvent(db, { incidentId: id, kind: "unlink_alert", metadata: { alert_id: alertId }, userId: actorId });
  return true;
}
