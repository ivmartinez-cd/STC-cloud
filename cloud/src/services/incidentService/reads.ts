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
  /** `true` → sólo sin equipo asociado ("SIN EQUIPO" del handoff hifi #3, fase 4). */
  noDevice?: boolean;
  /** Antigüedad mínima en horas ("+24 H" del handoff) — sobre `aging_seconds`,
   * recalculado acá porque un alias del SELECT no es visible en el WHERE de Postgres. */
  minAgeHours?: number | null;
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
      // "ABIERTOS" agrupa open+in_progress+on_hold (mismo criterio que `openTotal`
      // de `getIncidentStats`) — un status literal sigue siendo match exacto.
      .modify((q) => {
        if (params.status === "open") q.andWhereNot("incidents.status", "closed");
        else if (params.status) q.andWhere("incidents.status", params.status);
      })
      .modify((q) => { if (params.klass) q.andWhere("incidents.class", params.klass); })
      .modify((q) => { if (params.severity) q.andWhere("incidents.severity", params.severity); })
      .modify((q) => { if (params.deviceId) q.andWhere("incidents.device_id", params.deviceId); })
      .modify((q) => { if (params.assignedTo) q.andWhere("incidents.assigned_to", params.assignedTo); })
      .modify((q) => { if (params.noDevice) q.whereNull("incidents.device_id"); })
      .modify((q) => {
        if (params.minAgeHours) {
          q.whereRaw(`EXTRACT(EPOCH FROM (COALESCE(incidents.closed_at, now()) - incidents.opened_at)) >= ?`, [params.minAgeHours * 3600]);
        }
      })
      .modify((q) => {
        const term = params.q;
        if (term) {
          q.andWhere((b) => {
            b.whereRaw("incidents.title ILIKE ?", [`%${term}%`])
              .orWhereRaw("incidents.device_serial ILIKE ?", [`%${term}%`])
              .orWhereRaw("incidents.external_id ILIKE ?", [`%${term}%`])
              .orWhereRaw("clients.name ILIKE ?", [`%${term}%`])
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

/** Clase + antigüedad de los ABIERTOS (handoff hifi #3, fase 4) — el panel
 * "Abiertos por clase y antigüedad" del mockup necesita esto agrupado, no
 * fila por fila. `on_hold`/`in_progress` cuentan como abiertos (mismo
 * criterio que `openTotal` de más abajo), `closed` no. */
async function byClassAging(db: Knex, clientId?: string | null) {
  return db("incidents")
    .modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
    .whereNot("status", "closed")
    .select("class")
    .count("id as count")
    .avg({ avg_aging_seconds: db.raw("EXTRACT(EPOCH FROM (now() - opened_at))") })
    .groupBy("class")
    .orderBy("count", "desc");
}

async function agingSummary(db: Knex, clientId?: string | null) {
  const row = await db("incidents")
    .modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
    .whereNot("status", "closed")
    .select(
      db.raw("AVG(EXTRACT(EPOCH FROM (now() - opened_at)))::bigint as avg_aging_seconds"),
      db.raw("MAX(EXTRACT(EPOCH FROM (now() - opened_at)))::bigint as max_aging_seconds")
    )
    .first();
  return { avgAgingSeconds: Number(row?.avg_aging_seconds ?? 0), maxAgingSeconds: Number(row?.max_aging_seconds ?? 0) };
}

// "Se abren y cierran casi en el mismo tick" — ruido de una regla mal
// configurada (delay_minutes muy bajo + alerta que ya estaba por resolverse
// sola), no actividad real de un operador. 60s cubre el caso del worker
// (tick cada 2 min: abrir y auto-cerrar en el mismo tick deja como mucho
// unos segundos de diferencia).
const INSTANT_CLOSE_THRESHOLD_SECONDS = 60;

/** Diagnóstico "cierres automáticos en 0 minutos" agrupado por clase — con
 * `rule_id` sólo cuando el grupo entero comparte una única regla (si hay
 * incidentes viejos sin `rule_id` o clientes con reglas propias distintas
 * para la misma clase, no hay una regla única que señalar). */
function instantClosuresQuery(db: Knex, clientId?: string | null) {
  // Postgres no tiene MIN/MAX nativo para `uuid` (error 42883) — castear a
  // `text` para elegir "cualquier valor determinístico del grupo" (no hace
  // falta el mínimo real, sólo uno estable), mismo criterio en las dos
  // columnas uuid de acá. Bug real encontrado por la sesión hermana vía
  // `/dashboard` (500) tras el build de Fase 4 — corregido acá.
  return db("incidents")
    .modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
    .where({ status: "closed", origin: "auto" })
    .whereNotNull("closed_at")
    .whereRaw(`EXTRACT(EPOCH FROM (closed_at - opened_at)) <= ?`, [INSTANT_CLOSE_THRESHOLD_SECONDS])
    .select("class")
    .count("id as count")
    .countDistinct({ distinct_rules: "rule_id" })
    .min({ rule_id: db.raw("rule_id::text") })
    .min({ sample_client_id: db.raw("client_id::text") })
    .groupBy("class")
    .orderBy("count", "desc");
}

async function instantAutoClosures(db: Knex, clientId?: string | null) {
  const rows = await instantClosuresQuery(db, clientId);
  return (rows as Array<{ class: string; count: string; distinct_rules: string; rule_id: string | null; sample_client_id: string }>)
    .map((r) => ({
      class: r.class,
      count: Number(r.count),
      ruleId: Number(r.distinct_rules) === 1 ? r.rule_id : null,
      sampleClientId: r.sample_client_id,
    }));
}

/** Sin operador asignado entre los abiertos, cerrados en los últimos 30 días
 * y origen (manual/auto) — las 3 cifras que faltan para la tira de 4 del
 * mockup ("ABIERTOS · sin operador asignado", "CERRADOS · N en <1 min",
 * "CREADOS MANUALMENTE · N automáticos"). Ventana de 30 días (no "del mes
 * calendario", que rompería el label en el corte de mes) — mismo criterio
 * que `/audit-logs/summary`/`/email-log/summary`. */
async function extraCounts(db: Knex, clientId?: string | null) {
  const [unassigned, recentClosed, byOrigin] = await Promise.all([
    db("incidents").modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
      .whereNot("status", "closed").whereNull("assigned_to").count("id as count").first(),
    db("incidents").modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
      .where("status", "closed").where("closed_at", ">=", db.raw("now() - interval '30 days'")).count("id as count").first(),
    db("incidents").modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
      .select("origin").count("id as count").groupBy("origin"),
  ]);
  const origin: Record<string, number> = { manual: 0, auto: 0 };
  for (const r of byOrigin as Array<{ origin: string; count: string }>) origin[r.origin] = Number(r.count);
  return {
    unassignedOpenCount: Number((unassigned as { count: string } | undefined)?.count ?? 0),
    recentClosedCount: Number((recentClosed as { count: string } | undefined)?.count ?? 0),
    byOrigin: origin,
  };
}

async function byStatusCounts(db: Knex, clientId?: string | null) {
  const rows = await db("incidents")
    .modify((q) => { if (clientId) q.andWhere("client_id", clientId); })
    .select("status")
    .count("id as count")
    .groupBy("status");
  const byStatus: Record<string, number> = { open: 0, in_progress: 0, on_hold: 0, closed: 0 };
  for (const r of rows as Array<{ status: string; count: string }>) byStatus[r.status] = Number(r.count);
  return { byStatus, openTotal: byStatus.open + byStatus.in_progress + byStatus.on_hold };
}

export async function getIncidentStats(db: Knex, params: { clientId?: string | null }): Promise<Record<string, unknown>> {
  const { byStatus, openTotal } = await byStatusCounts(db, params.clientId);

  const [classRows, aging, instantClosures, extra] = await Promise.all([
    byClassAging(db, params.clientId),
    agingSummary(db, params.clientId),
    instantAutoClosures(db, params.clientId),
    extraCounts(db, params.clientId),
  ]);
  const byClass = (classRows as Array<{ class: string; count: string; avg_aging_seconds: string | null }>)
    .map((r) => ({ class: r.class, count: Number(r.count), avgAgingSeconds: Math.round(Number(r.avg_aging_seconds ?? 0)) }));

  return { byStatus, openTotal, byClass, ...aging, instantClosures, ...extra };
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
