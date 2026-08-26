import { Knex } from "knex";

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
