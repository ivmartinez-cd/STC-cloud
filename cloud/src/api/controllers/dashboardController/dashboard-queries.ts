import type { Knex } from "knex";
import { deviceIdsOf, type Scope } from "../../utils/scope";
import { onlyLiveDevices, notMerged } from "../../utils/deviceFilters";
import { buildScopedAlertQuery } from "./shared";

export function queryDevicesCount(db: Knex, cid: string | null) {
  return db("devices")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .count("* as c")
    .first();
}

// Fase 6 del gap analysis vs HP SDS — fix real: no filtraba status='revoked'
// (offlineAgents más abajo sí lo hace), así que un agente revocado inflaba
// `total` para siempre — de ahí el "1/426" absurdo que se veía comparando
// contra HP SDS.
export function queryAgentsStats(db: Knex, cid: string | null, fiveMinsAgo: Date) {
  return db("agents")
    .whereNot("status", "revoked")
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .select(
      db.raw("COUNT(*)::int as total"),
      db.raw("COUNT(CASE WHEN last_seen >= ? THEN 1 END)::int as online", [fiveMinsAgo])
    )
    .first();
}

export function queryClientsCount(db: Knex, cid: string | null) {
  return db("clients")
    .modify((q) => { if (cid) q.where("id", cid); })
    .count("* as c")
    .first();
}

// Suma de deltas positivos entre lecturas consecutivas (no MAX-MIN del período):
// un reset/decremento de contador dentro del mes no debe inflar el volumen.
// La ventana interna se extiende 40 días atrás para que la primera lectura
// del mes tenga como base la última lectura del mes anterior. El filtro por
// cliente va DENTRO del subselect con ventana (no afuera, sobre `sub`): así el
// LAG de cada dispositivo sigue viendo su propia lectura previa aunque se
// filtre por cliente.
export function queryMonthlyVolume(db: Knex, cid: string | null) {
  return db
    .raw(
      `
    SELECT SUM(GREATEST(delta, 0))::bigint as total FROM (
      SELECT
        r.time,
        r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) as delta
      FROM readings r
      ${cid ? "JOIN devices d ON d.id = r.device_id" : ""}
      WHERE r.time >= date_trunc('month', now()) - INTERVAL '40 days'
      ${cid ? "AND d.client_id = ? AND d.merged_into IS NULL" : ""}
    ) sub
    WHERE delta IS NOT NULL AND time >= date_trunc('month', now())
  `,
      cid ? [cid] : []
    )
    .then((r: { rows: Array<{ total: string | null }> }) => r.rows[0]);
}

export function queryTopClients(db: Knex, cid: string | null) {
  return db("clients")
    .select(
      "clients.name",
      "clients.id",
      db.raw(
        "COUNT(DISTINCT CASE WHEN devices.decommissioned_at IS NULL AND devices.merged_into IS NULL THEN devices.id END)::int as device_count"
      )
    )
    .leftJoin("devices", "devices.client_id", "clients.id")
    .modify((q) => { if (cid) q.where("clients.id", cid); })
    .groupBy("clients.id", "clients.name")
    .orderBy("device_count", "desc")
    .limit(5);
}

export function queryBrandStats(db: Knex, cid: string | null) {
  return db("devices")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .modify((q) => { if (cid) q.where("devices.client_id", cid); })
    .select("brand")
    .count("* as count")
    .groupBy("brand")
    .orderBy("count", "desc")
    .limit(5);
}

export function queryOfflineAgents(db: Knex, cid: string | null, fiveMinsAgo: Date) {
  return db("agents")
    .join("clients", "agents.client_id", "clients.id")
    .where((builder: Knex.QueryBuilder) => {
      builder
        .where("agents.last_seen", "<", fiveMinsAgo)
        .orWhereNull("agents.last_seen")
        .orWhere("agents.status", "offline");
    })
    .whereNot("agents.status", "revoked")
    .modify((q) => { if (cid) q.andWhere("agents.client_id", cid); })
    .select("agents.id", "agents.name", "clients.name as client_name", "agents.last_seen")
    .orderBy("agents.last_seen", "desc")
    .limit(10);
}

export function queryNewDevicesCount(db: Knex, cid: string | null) {
  return db("devices")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .where("created_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .count("* as c")
    .first();
}

export function queryReadings24hCount(db: Knex, cid: string | null) {
  return db("readings")
    .where("time", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000))
    .modify((q) => { if (cid) q.whereIn("device_id", deviceIdsOf(db, cid)); })
    .count("* as c")
    .first();
}

export function queryLastReadingInfo(db: Knex, cid: string | null) {
  return db("readings")
    .join("devices", "readings.device_id", "devices.id")
    .join("clients", "devices.client_id", "clients.id")
    .modify((q) => notMerged(q, "devices"))
    .modify((q) => { if (cid) q.where("devices.client_id", cid); })
    .orderBy("readings.time", "desc")
    .select("readings.time", "clients.name as client_name")
    .first();
}

export function queryClientsWithAlertsCount(db: Knex, cid: string | null) {
  return db("alerts")
    .join("devices", "alerts.device_id", "devices.id")
    .where("alerts.resolved", false)
    .modify((q) => onlyLiveDevices(q, "devices"))
    .modify((q) => { if (cid) q.andWhere("devices.client_id", cid); })
    .countDistinct("devices.client_id as c")
    .first();
}

// "Gestionados / no gestionados" (Fase 6) — se DERIVA de `monitor_state`
// (Fase 5), no de un flag nuevo: un equipo `disabled` es la definición de "no
// gestionado". Campo aditivo (`stats.devicesUnmanaged`), no se cambia la
// forma de `stats.devices` para no romper consumidores existentes.
export function queryDevicesUnmanagedCount(db: Knex, cid: string | null) {
  return db("devices")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .where("monitor_state", "disabled")
    .count("* as c")
    .first();
}

// "% reportando": agentes con AL MENOS un equipo con lectura en las últimas
// 24h — deliberadamente sobre `devices.last_seen` (datos), no `agents.last_seen`
// (heartbeat, ya cubierto por `online` arriba) ni sobre `readings` crudo
// (sería un scan caro en cada poll del dashboard). Tabla chica, índice por agent_id.
export function queryAgentsReportingCount(db: Knex, cid: string | null, twentyFourHoursAgo: Date) {
  return db("devices")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .where("last_seen", ">=", twentyFourHoursAgo)
    .countDistinct("agent_id as c")
    .first();
}

// Distribución de versiones de agente en la flota — `agents.version` ya existe
// (`20260517000000_agent_system_telemetry.ts`) y la escribe `agentService.ts`
// en cada heartbeat.
export function queryAgentVersionRows(db: Knex, cid: string | null) {
  return db("agents")
    .whereNot("status", "revoked")
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .select(db.raw("COALESCE(NULLIF(version, ''), 'desconocida') as version"))
    .count("* as count")
    .groupBy("version")
    .orderBy("count", "desc")
    .limit(10);
}

// Alertas activas por clase — reusa el mismo LEFT JOIN triple + scoping de
// `getAlerts`/`getAlertSummary` (Fase 1), factorizado en `buildScopedAlertQuery`
// para no reimplementar sus tres sutilezas acá (agent-scoped sin device_id,
// exclusión de lápidas, scope RBAC).
export function queryAlertsByClassRows(db: Knex, scope: Scope) {
  return buildScopedAlertQuery(db, scope, { resolved: "false" })
    .select("alerts.alert_class")
    .count("alerts.id as count")
    .groupBy("alerts.alert_class");
}

// "Descubiertos hoy/ayer" — `devices.created_at` YA es la fecha de
// descubrimiento (no hace falta una columna nueva).
export function queryDiscoveredTodayCount(db: Knex, cid: string | null, startOfToday: Date) {
  return db("devices")
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .where("created_at", ">=", startOfToday)
    .count("* as c")
    .first();
}

export function queryDiscoveredYesterdayCount(db: Knex, cid: string | null, startOfYesterday: Date, startOfToday: Date) {
  return db("devices")
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .whereBetween("created_at", [startOfYesterday, startOfToday])
    .count("* as c")
    .first();
}

// Fase 7 del gap analysis vs HP SDS — completa el placeholder que dejó la
// Fase 6: total real de la cola de pendientes.
export function queryPendingDevicesTotalCount(db: Knex, cid: string | null) {
  return db("devices")
    .where("registration_state", "pending")
    .whereNull("decommissioned_at")
    .whereNull("merged_into")
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .count("* as c")
    .first();
}

// Franja "Estadísticas" del dashboard (rediseño estilo HP SDS): "dispositivos
// reportando" = equipos vivos con lectura en 24h — misma base (`devices.last_seen`)
// que `queryAgentsReportingCount`, así los dos porcentajes son comparables.
export function queryDevicesReportingCount(db: Knex, cid: string | null, twentyFourHoursAgo: Date) {
  return db("devices")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .where("last_seen", ">=", twentyFourHoursAgo)
    .count("* as c")
    .first();
}

// Panel "Movimientos y cambios" (HP SDS): cantidad de entradas de auditoría de
// hoy y ayer + total histórico. `audit_logs.client_id` es nullable (acciones
// globales), por eso el scope por cliente sólo filtra cuando hay cid.
export function queryMovementsCounts(db: Knex, cid: string | null, startOfYesterday: Date) {
  return db("audit_logs")
    .modify((q) => { if (cid) q.where("client_id", cid); })
    .select(
      db.raw("COUNT(*)::int as total"),
      db.raw("COUNT(CASE WHEN created_at >= ? THEN 1 END)::int as recent", [startOfYesterday])
    )
    .first();
}
