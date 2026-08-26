import type { Knex } from "knex";
import type { ClientDirectoryRow, ClientPortfolioSummary } from "../../../domain/entities/client";
import type { ClientDirectoryQuery, ClientScope } from "../../../domain/repositories/client-repository";
import { clientCountsSelect } from "./crud";

const DIRECTORY_SORT_COLUMNS: Record<NonNullable<ClientDirectoryQuery["sortField"]>, string> = {
  monitor_count: "monitor_count",
  device_count: "device_count",
  alerts_count: "alerts_count",
  last_report_at: "last_report_at",
};

/** `name`/`contact_name`/`contact_email`/`country` — ILIKE OR'd, mismo criterio que `applyDeviceSearch` en `devices`. */
function applyClientDirectorySearch(q: Knex.QueryBuilder, term: string) {
  q.andWhere((b) => {
    b.whereRaw("name ILIKE ?", [`%${term}%`])
      .orWhereRaw("contact_name ILIKE ?", [`%${term}%`])
      .orWhereRaw("contact_email ILIKE ?", [`%${term}%`])
      .orWhereRaw("country ILIKE ?", [`%${term}%`]);
  });
}

/** `estado` derivado en SQL sobre columnas YA agregadas (`agg.contact_name`/`agg.last_report_at`) —
 * ver docblock de `ClientEstado`. `NOT (...)` en vez de `IS NULL/= ''` invertido a propósito:
 * un solo lugar define "tiene contacto", reusado también por `getPortfolioSummary`. */
const HAS_CONTACT_SQL = "agg.contact_name IS NOT NULL AND btrim(agg.contact_name) <> ''";
const ESTADO_CASE_SQL = `
  CASE
    WHEN NOT (${HAS_CONTACT_SQL}) THEN 'sin_contacto'
    WHEN agg.last_report_at IS NULL OR agg.last_report_at < NOW() - INTERVAL '24 hours' THEN 'sin_reporte'
    ELSE 'activo'
  END
`;

interface PortfolioAggRow {
  contact_name: string | null;
  monitor_count: number;
  device_count: number;
  alerts_count: number;
}

/** Pura — separada de `getPortfolioSummary` para que el cálculo (y sus tests) no
 * dependan de Knex. */
function summarizePortfolioRows(rows: PortfolioAggRow[]): ClientPortfolioSummary {
  const clientsTotal = rows.length;
  const withContact = rows.filter((r) => r.contact_name != null && r.contact_name.trim() !== "").length;
  const devicesTotal = rows.reduce((sum, r) => sum + Number(r.device_count), 0);
  const monitorsTotal = rows.reduce((sum, r) => sum + Number(r.monitor_count), 0);
  const withOpenAlerts = rows.filter((r) => Number(r.alerts_count) > 0).length;
  const openAlertsTotal = rows.reduce((sum, r) => sum + Number(r.alerts_count), 0);
  const top5DeviceCount = [...rows]
    .sort((a, b) => Number(b.device_count) - Number(a.device_count))
    .slice(0, 5)
    .reduce((sum, r) => sum + Number(r.device_count), 0);

  return {
    clients_total: clientsTotal,
    devices_total: devicesTotal,
    monitors_total: monitorsTotal,
    with_contact: withContact,
    without_contact: clientsTotal - withContact,
    with_open_alerts: withOpenAlerts,
    open_alerts_total: openAlertsTotal,
    top5_device_count: top5DeviceCount,
    top5_device_share_pct: devicesTotal > 0 ? Math.round((top5DeviceCount / devicesTotal) * 1000) / 10 : 0,
  };
}

/** Alertas ABIERTAS por cliente — mismo join que `alertsForClient` en `alertDigestJob.ts`
 * (alerts → devices → agents, con `COALESCE` para alertas agent-scoped sin equipo),
 * ya agrupado por cliente para poder unirse 1:1 sin repetir filas. */
function openAlertsPerClient(db: Knex) {
  return db("alerts")
    .leftJoin("devices", "alerts.device_id", "devices.id")
    .leftJoin("agents", "agents.id", db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
    .where("alerts.resolved", false)
    .whereNotNull("agents.client_id")
    .groupBy("agents.client_id")
    .select("agents.client_id as client_id", db.raw("COUNT(*)::int as alerts_count"));
}

/** Último reporte (última lectura) de cualquier equipo VIVO del cliente — mismo criterio
 * de "vivo" (`decommissioned_at`/`merged_into`) que ya usa `clientCountsSelect`, para
 * no mostrar un número de "equipos" en la tabla que no case con "último reporte". */
function lastReportPerClient(db: Knex) {
  return db("devices")
    .whereNull("devices.decommissioned_at")
    .whereNull("devices.merged_into")
    .groupBy("devices.client_id")
    .select("devices.client_id as client_id", db.raw("MAX(devices.last_seen) as last_report_at"));
}

/** Por-cliente: conteos + alertas abiertas + último reporte, SIN `estado` todavía — base
 * compartida por `listDirectory` y `getPortfolioSummary` para que ambos endpoints nunca
 * se desincronicen en cómo cuentan lo mismo. */
function directoryAggregate(db: Knex, scope: ClientScope) {
  return db("clients")
    .leftJoin("agents as a", "a.client_id", "clients.id")
    .leftJoin("devices as d", "d.client_id", "clients.id")
    .leftJoin(openAlertsPerClient(db).as("alerts_agg"), "alerts_agg.client_id", "clients.id")
    .leftJoin(lastReportPerClient(db).as("report_agg"), "report_agg.client_id", "clients.id")
    .modify((q) => { if (scope.kind === "client") q.where("clients.id", scope.id); })
    .groupBy("clients.id")
    .select(
      "clients.id", "clients.name", "clients.contact_name", "clients.contact_email", "clients.country",
      ...clientCountsSelect(db),
      db.raw("COALESCE(MAX(alerts_agg.alerts_count), 0)::int as alerts_count"),
      db.raw("MAX(report_agg.last_report_at) as last_report_at")
    );
}

/** `directoryAggregate` + `estado` ya materializado como columna real (no un alias de
 * SELECT: Postgres no deja filtrar/ordenar por un alias del mismo nivel en WHERE, así
 * que se envuelve un nivel para que `estado`/`alerts_count` sean columnas normales del
 * nivel siguiente — ver `listDirectory`). */
function directoryWithEstado(db: Knex, scope: ClientScope) {
  const agg = directoryAggregate(db, scope).as("agg");
  return db.select("agg.*", db.raw(`(${ESTADO_CASE_SQL}) as estado`)).from(agg);
}

/** `q`/`segment` sobre columnas ya reales de `rows` (ver `directoryWithEstado`). */
function applyDirectoryFilters(q: Knex.QueryBuilder, query: ClientDirectoryQuery) {
  if (query.q) applyClientDirectorySearch(q, query.q);
  if (query.segment === "sin_contacto") q.where("estado", "sin_contacto");
  else if (query.segment === "con_alertas") q.where("alerts_count", ">", 0);
  else if (query.segment === "sin_reporte_24h") q.where("estado", "sin_reporte");
}

function directoryFiltered(db: Knex, query: ClientDirectoryQuery) {
  const rows = directoryWithEstado(db, query.scope).as("rows");
  return db.select("rows.*").from(rows).modify((q) => applyDirectoryFilters(q, query));
}

/** Los NULL de `last_report_at` ("nunca reportó") siempre al final, sin importar la
 * dirección — de lo contrario DESC (default de Postgres para NULL) los pondría
 * primero al ordenar por "más reciente", justo lo opuesto de lo esperado. */
function applyDirectorySort(q: Knex.QueryBuilder, sortColumn: string, sortDir: "asc" | "desc") {
  if (sortColumn === "last_report_at") q.orderByRaw(`last_report_at ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
  else q.orderBy(sortColumn, sortDir);
  q.orderBy("name", "asc");
}

/** Paginado/filtrado/ordenado (handoff hifi "Clientes", 25/08/2026 — mismo criterio de
 * `{items, total}`/techo 200 que `DeviceRepository.list()`). */
export async function listClientDirectory(db: Knex, query: ClientDirectoryQuery): Promise<{ items: ClientDirectoryRow[]; total: number }> {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const sortColumn = DIRECTORY_SORT_COLUMNS[query.sortField ?? "device_count"];
  const sortDir: "asc" | "desc" = query.sortDir === "asc" ? "asc" : "desc";

  const [items, [{ count }]] = await Promise.all([
    directoryFiltered(db, query).modify((q) => applyDirectorySort(q, sortColumn, sortDir)).limit(limit).offset(offset),
    directoryFiltered(db, query).clearSelect().count("* as count"),
  ]);
  return { items, total: Number(count) };
}

/** Tira de métricas de cartera — reusa `directoryWithEstado` (sin filtros/paginación)
 * para que nunca se desincronice con lo que muestra la tabla, y agrega en JS (una sola
 * lectura de ~N clientes, liviana: no vale la pena una segunda query SQL para el top 5). */
export async function getClientPortfolioSummary(db: Knex, scope: ClientScope): Promise<ClientPortfolioSummary> {
  const rows: PortfolioAggRow[] =
    await db.select("contact_name", "monitor_count", "device_count", "alerts_count").from(directoryWithEstado(db, scope).as("rows"));
  return summarizePortfolioRows(rows);
}
