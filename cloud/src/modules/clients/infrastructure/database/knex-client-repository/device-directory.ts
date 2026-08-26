import type { Knex } from "knex";
import { readSystemSettings } from "../../../../system-settings";
import { notMerged, onlyLiveDevices } from "../../../../../api/utils/deviceFilters";
import type { ClientDeviceDirectoryRow, ClientDeviceRow } from "../../../domain/entities/client";
import type { ClientDeviceDirectoryQuery } from "../../../domain/entities/client";

/** `estado` de UN dispositivo — ver docblock de `ClientDeviceEstado`. Umbral
 * de "modelo unificado" (`system_settings.device_offline_threshold_minutes`,
 * 26/08/2026) — mismo cutoff que `heartbeatMonitor.ts`/
 * `AGENT_DEVICE_ESTADO_SQL`, nunca un `INTERVAL` hardcodeado acá. `cutoff` se
 * pasa como bind param (`?`), nunca interpolado en el string SQL. */
const DEVICE_ESTADO_SQL = `
  CASE
    WHEN devices.last_seen IS NULL THEN 'sin_reporte'
    WHEN devices.last_seen < ? THEN 'sin_conexion'
    ELSE 'en_linea'
  END
`;

/** Mínimo entre los 4 tóners no nulos — Postgres ignora NULL en LEAST/GREATEST,
 * NULL sólo si los 4 son NULL. Ver docblock de `consumible_pct` en `client.ts`. */
const CONSUMIBLE_PCT_SQL = "LEAST(devices.toner_black, devices.toner_cyan, devices.toner_magenta, devices.toner_yellow)";

const DEVICE_DIRECTORY_SORT_COLUMNS: Record<NonNullable<ClientDeviceDirectoryQuery["sortField"]>, string> = {
  alerts_count: "alerts_count",
  consumible_pct: "consumible_pct",
  last_seen: "last_seen",
};

/** `serial_number`/`model`/`location` — ILIKE OR'd (README: "Buscar por serie, modelo o ubicación…"). */
function applyClientDeviceSearch(q: Knex.QueryBuilder, term: string) {
  q.andWhere((b) => {
    b.whereRaw("serial_number ILIKE ?", [`%${term}%`])
      .orWhereRaw("model ILIKE ?", [`%${term}%`])
      .orWhereRaw("location ILIKE ?", [`%${term}%`]);
  });
}

/** Alertas ABIERTAS por dispositivo — mismo join base que `openAlertsPerClient` (en
 * `directory.ts`), pero agrupado por `device_id` (no por cliente) y sólo alertas CON
 * equipo: una alerta agent-scoped sin `device_id` (p.ej. `agent_offline`) no puede
 * atribuirse a una fila puntual de esta tabla, sólo cuenta en el agregado de cliente. */
function openAlertsPerDevice(db: Knex) {
  return db("alerts")
    .whereNotNull("alerts.device_id")
    .where("alerts.resolved", false)
    .groupBy("alerts.device_id")
    .select("alerts.device_id as device_id", db.raw("COUNT(*)::int as alerts_count"));
}

/** Filas del cliente con `estado`/`consumible_pct`/`alerts_count` ya computados —
 * a diferencia de `directoryAggregate` (clientes), acá no hace falta un wrap extra
 * para "materializar" esos alias: ninguno depende de un GROUP BY de esta consulta
 * (uno es por-fila sobre columnas base, el otro es un LEFT JOIN 1:1 por dispositivo),
 * así que un solo nivel de wrap (en `clientDeviceFiltered`) alcanza para poder
 * filtrar/ordenar por ellos. */
function clientDeviceBase(db: Knex, clientId: string, offlineCutoff: Date) {
  return db("devices")
    .where("devices.client_id", clientId)
    .modify((q) => onlyLiveDevices(q, "devices"))
    .leftJoin(openAlertsPerDevice(db).as("alerts_agg"), "alerts_agg.device_id", "devices.id")
    .select(
      "devices.id", "devices.brand", "devices.model", "devices.name", "devices.serial_number",
      "devices.location", "devices.last_seen",
      // Los 4 tóners individuales (no sólo el mínimo) — la tabla pinta una
      // mini-barra por color en equipos color (funcionalidad real que ya
      // existía antes del rediseño hifi).
      "devices.toner_black", "devices.toner_cyan", "devices.toner_magenta", "devices.toner_yellow",
      db.raw(`(${DEVICE_ESTADO_SQL}) as estado`, [offlineCutoff]),
      db.raw(`${CONSUMIBLE_PCT_SQL} as consumible_pct`),
      db.raw("COALESCE(alerts_agg.alerts_count, 0)::int as alerts_count")
    );
}

function clientDeviceFiltered(db: Knex, query: ClientDeviceDirectoryQuery, offlineCutoff: Date) {
  const rows = clientDeviceBase(db, query.clientId, offlineCutoff).as("rows");
  return db.select("rows.*").from(rows).modify((q) => {
    if (query.q) applyClientDeviceSearch(q, query.q);
    if (query.segment === "sin_conexion") q.where("estado", "sin_conexion");
    else if (query.segment === "con_alertas") q.where("alerts_count", ">", 0);
    else if (query.segment === "consumible_bajo") q.where("consumible_pct", "<=", 35);
  });
}

/** NULLS LAST en `last_seen` — mismo motivo que `applyDirectorySort` (clientes):
 * un equipo que nunca reportó siempre al final, sin importar la dirección. */
function applyClientDeviceSort(q: Knex.QueryBuilder, sortColumn: string, sortDir: "asc" | "desc") {
  if (sortColumn === "last_seen") q.orderByRaw(`last_seen ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
  else q.orderByRaw(`${sortColumn} ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
  q.orderBy("model", "asc");
}

/** Tabla "Infraestructura de monitoreo" del handoff hifi "Cliente — detalle"
 * (25/08/2026) — paginado/filtrado/ordenado real, a diferencia de `listDevices()`
 * de abajo. Default: alertas desc (README). */
export async function listClientDevicesDirectory(db: Knex, query: ClientDeviceDirectoryQuery): Promise<{ items: ClientDeviceDirectoryRow[]; total: number }> {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const sortColumn = DEVICE_DIRECTORY_SORT_COLUMNS[query.sortField ?? "alerts_count"];
  const sortDir: "asc" | "desc" = query.sortDir === "asc" ? "asc" : "desc";
  // Umbral unificado (26/08/2026) — mismo `system_settings` que
  // `heartbeatMonitor.ts`/`AGENT_DEVICE_ESTADO_SQL`, nunca un `INTERVAL` propio.
  const { deviceOfflineThresholdMinutes } = await readSystemSettings(db);
  const offlineCutoff = new Date(Date.now() - deviceOfflineThresholdMinutes * 60 * 1000);

  const [items, [{ count }]] = await Promise.all([
    clientDeviceFiltered(db, query, offlineCutoff).modify((q) => applyClientDeviceSort(q, sortColumn, sortDir)).limit(limit).offset(offset),
    clientDeviceFiltered(db, query, offlineCutoff).clearSelect().count("* as count"),
  ]);
  return { items, total: Number(count) };
}

/**
 * Techo de seguridad (R9 gap analysis vs HP SDS): esta consulta no tenía
 * NINGÚN límite — a diferencia de `DeviceRepository.list()` (paginado
 * 25/08/2026) o el viejo `.limit(5000)` que tenía antes. Los 2 consumidores
 * actuales (`CreateIncidentModal`, `RemoteActions`) son `<select>` chicos,
 * no tablas — no justifican paginación real todavía, pero un cliente
 * atípico con cientos de equipos no debería poder tumbar ese selector.
 * Si algún día un consumidor necesita más de 500, esa es la señal de que
 * necesita el mismo tratamiento de paginación que ya tiene `/devices`.
 */
export function listClientDevices(db: Knex, clientId: string, includeDecommissioned: boolean): Promise<ClientDeviceRow[]> {
  return db("devices")
    .leftJoin("agents", "devices.agent_id", "agents.id")
    .where("devices.client_id", clientId)
    .modify((q) => { if (!includeDecommissioned) onlyLiveDevices(q, "devices"); else notMerged(q, "devices"); })
    .select(
      "devices.*",
      db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
      "agents.name as monitor_name",
      "agents.last_seen as monitor_last_seen"
    )
    .orderBy("devices.brand")
    .limit(500);
}
