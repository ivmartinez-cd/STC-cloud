import { Knex } from "knex";
import { classOfAlert } from "./incidentClassifier";

/**
 * Fase 11 del gap analysis vs HP SDS — servicio de incidentes. `incident_events`
 * es el audit trail PROPIO del incidente (kind/body/metadata/user/fecha) — no
 * se duplica en `audit_logs` genérico, que ya tiene su propio feed de
 * "Movimientos y cambios" para acciones de dispositivos/clientes/usuarios.
 */

export class IncidentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const STATUSES = ["open", "in_progress", "on_hold", "closed"] as const;
type IncidentStatus = (typeof STATUSES)[number];

async function writeEvent(
  db: Knex | Knex.Transaction,
  params: { incidentId: string; kind: string; body?: string | null; metadata?: unknown; userId?: string | null }
): Promise<void> {
  await db("incident_events").insert({
    incident_id: params.incidentId,
    kind: params.kind,
    body: params.body ?? null,
    metadata: params.metadata !== undefined ? JSON.stringify(params.metadata) : null,
    user_id: params.userId ?? null,
  });
}

// Aging = EXTRACT(EPOCH FROM COALESCE(closed_at, now()) - opened_at) — NUNCA
// se guarda una columna, se calcula siempre al leer (mismo criterio que
// `utilization_pct` de la Fase 4: un dato derivado no debe poder desincronizarse).
const AGING_SQL = `EXTRACT(EPOCH FROM (COALESCE(incidents.closed_at, now()) - incidents.opened_at))::bigint AS aging_seconds`;

function baseSelect(db: Knex) {
  return db("incidents")
    .leftJoin("clients", "clients.id", "incidents.client_id")
    .leftJoin("devices", "devices.id", "incidents.device_id")
    .leftJoin("agents", "agents.id", "incidents.agent_id")
    .leftJoin("users as assignee", "assignee.id", "incidents.assigned_to")
    .leftJoin("users as creator", "creator.id", "incidents.created_by");
}

export interface ListIncidentsParams {
  clientId?: string | null;
  status?: string | null;
  klass?: string | null;
  severity?: string | null;
  deviceId?: string | null;
  assignedTo?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
  order?: "opened_at_desc" | "opened_at_asc" | "aging_desc";
}

export async function listIncidents(db: Knex, params: ListIncidentsParams): Promise<{ items: any[]; total: number }> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const build = () =>
    baseSelect(db)
      .modify((q) => { if (params.clientId) q.andWhere("incidents.client_id", params.clientId); })
      .modify((q) => { if (params.status) q.andWhere("incidents.status", params.status); })
      .modify((q) => { if (params.klass) q.andWhere("incidents.class", params.klass); })
      .modify((q) => { if (params.severity) q.andWhere("incidents.severity", params.severity); })
      .modify((q) => { if (params.deviceId) q.andWhere("incidents.device_id", params.deviceId); })
      .modify((q) => { if (params.assignedTo) q.andWhere("incidents.assigned_to", params.assignedTo); })
      .modify((q) => {
        const term = params.q;
        if (term) {
          q.andWhere((b) => {
            b.whereRaw("incidents.title ILIKE ?", [`%${term}%`])
              .orWhereRaw("incidents.device_serial ILIKE ?", [`%${term}%`])
              .orWhereRaw("incidents.external_id ILIKE ?", [`%${term}%`])
              .orWhereRaw("incidents.number::text = ?", [term]);
          });
        }
      });

  const orderCol = params.order === "opened_at_asc" ? ["incidents.opened_at", "asc"] as const
    : params.order === "aging_desc" ? ["aging_seconds", "desc"] as const
    : ["incidents.opened_at", "desc"] as const;

  const [items, [{ count }]] = await Promise.all([
    build()
      .select(
        "incidents.*",
        "clients.name as client_name",
        "agents.name as agent_name",
        "assignee.username as assigned_to_username",
        "creator.username as created_by_username",
        db.raw(AGING_SQL)
      )
      .orderBy(orderCol[0], orderCol[1])
      .limit(limit)
      .offset(offset),
    build().count("incidents.id as count"),
  ]);

  return { items, total: Number(count) };
}

export async function getIncidentStats(db: Knex, params: { clientId?: string | null }): Promise<Record<string, unknown>> {
  const rows = await db("incidents")
    .modify((q) => { if (params.clientId) q.andWhere("client_id", params.clientId); })
    .select("status")
    .count("id as count")
    .groupBy("status");
  const byStatus: Record<string, number> = { open: 0, in_progress: 0, on_hold: 0, closed: 0 };
  for (const r of rows as Array<{ status: string; count: string }>) byStatus[r.status] = Number(r.count);
  const openTotal = byStatus.open + byStatus.in_progress + byStatus.on_hold;
  return { byStatus, openTotal };
}

export async function getIncident(db: Knex, id: string): Promise<any | null> {
  const item = await baseSelect(db)
    .where("incidents.id", id)
    .select(
      "incidents.*",
      "clients.name as client_name",
      "agents.name as agent_name",
      "assignee.username as assigned_to_username",
      "creator.username as created_by_username",
      db.raw(AGING_SQL)
    )
    .first();
  if (!item) return null;

  const [alerts, events] = await Promise.all([
    db("incident_alerts")
      .join("alerts", "alerts.id", "incident_alerts.alert_id")
      .where("incident_alerts.incident_id", id)
      .select("alerts.*", "incident_alerts.linked_at", "incident_alerts.linked_by")
      .orderBy("incident_alerts.linked_at", "desc"),
    db("incident_events")
      .leftJoin("users", "users.id", "incident_events.user_id")
      .where("incident_id", id)
      .select("incident_events.*", "users.username as user_username")
      .orderBy("incident_events.created_at", "asc"),
  ]);

  return { ...item, alerts, events };
}

export interface CreateIncidentParams {
  clientId: string;
  deviceId?: string | null;
  klass: string;
  title?: string | null;
  description?: string | null;
  severity?: "warning" | "critical";
  externalId?: string | null;
  alertIds?: number[];
  actorId?: string | null;
}

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
  if (!STATUSES.includes(status)) throw new IncidentError(`status inválido: debe ser uno de ${STATUSES.join(", ")}`);
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
      (err as IncidentError & { conflictId?: string }).conflictId = conflict.id;
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

// ─── Reglas de auto-creación ────────────────────────────────────────────────

export async function listIncidentRules(db: Knex, clientId: string): Promise<any[]> {
  return db("incident_rules")
    .where((b) => b.whereNull("client_id").orWhere("client_id", clientId))
    .orderBy("class");
}

/**
 * Upsert por clase — sólo permite escribir filas del CLIENTE (nunca las
 * globales `client_id=NULL`). SELECT-then-INSERT/UPDATE explícito en vez de
 * `.onConflict()`: el índice único es sobre una expresión
 * (`COALESCE(client_id, nil-uuid), class`), no sobre columnas planas, y ya
 * hace falta leer `existing` para calcular los defaults — un segundo camino
 * por Knex `.onConflict(db.raw(...))` no aportaría nada que este branch
 * explícito no tenga ya, con menos certeza sobre el SQL generado.
 */
export async function upsertIncidentRule(
  db: Knex,
  clientId: string,
  klass: string,
  patch: { enabled?: boolean; min_severity?: string; delay_minutes?: number; sla_hours?: number | null; auto_close_on_alerts_resolved?: boolean }
): Promise<any> {
  const existing = await db("incident_rules").where({ client_id: clientId, class: klass }).first();
  const values = {
    client_id: clientId, class: klass,
    enabled: patch.enabled ?? existing?.enabled ?? false,
    min_severity: patch.min_severity ?? existing?.min_severity ?? "critical",
    delay_minutes: patch.delay_minutes ?? existing?.delay_minutes ?? 0,
    sla_hours: patch.sla_hours !== undefined ? patch.sla_hours : (existing?.sla_hours ?? null),
    auto_close_on_alerts_resolved: patch.auto_close_on_alerts_resolved ?? existing?.auto_close_on_alerts_resolved ?? false,
    updated_at: new Date(),
  };
  if (existing) {
    const [row] = await db("incident_rules").where({ id: existing.id }).update(values).returning("*");
    return row;
  }
  const [row] = await db("incident_rules").insert(values).returning("*");
  return row;
}

export { classOfAlert };
