import type { Knex } from "knex";
import { readSystemSettings } from "../../../../system-settings";
import type { AgentDeviceDirectoryQuery, AgentDeviceDirectoryRow, AgentDeviceSortField } from "../../../domain/entities/monitor-detail";

/** `estado` de un dispositivo en el detalle de MONITOR — a diferencia de
 * `DEVICE_ESTADO_SQL` en `knex-client-repository.ts`, acá SÍ hay un 3er estado
 * (`sin_aprobar`) porque esta tabla, a propósito, no usa `onlyLiveDevices()`
 * (que excluye `pending`) — el hifi pide ver los descubiertos sin aprobar en
 * la misma tabla, con su propio chip. Umbral del "modelo unificado"
 * (`system_settings.device_offline_threshold_minutes`, 26/08/2026), mismo
 * cutoff que `heartbeatMonitor.ts`/`DEVICE_ESTADO_SQL` — bind param `?`,
 * nunca un `INTERVAL` hardcodeado. */
const AGENT_DEVICE_ESTADO_SQL = `
  CASE
    WHEN devices.registration_state = 'pending' THEN 'sin_aprobar'
    WHEN devices.last_seen IS NULL OR devices.last_seen < ? THEN 'sin_conexion'
    ELSE 'en_linea'
  END
`;
const AGENT_CONSUMIBLE_PCT_SQL = "LEAST(devices.toner_black, devices.toner_cyan, devices.toner_magenta, devices.toner_yellow)";
const AGENT_DEVICE_DIRECTORY_SORT_COLUMNS: Record<AgentDeviceSortField, string> = {
  alerts_count: "alerts_count", consumible_pct: "consumible_pct", last_seen: "last_seen",
};

/** Vivo para esta tabla: ni de baja, ni fusionado, ni ignorado — a diferencia de
 * `onlyLiveDevices()` (excluye también `pending`), acá un equipo `pending` debe
 * seguir apareciendo (con chip `SIN APROBAR`), es justamente lo que esta tabla
 * necesita mostrar. */
export function notDecommissionedNotMergedNotIgnored(q: Knex.QueryBuilder, alias = "devices"): Knex.QueryBuilder {
  return q.whereNull(`${alias}.decommissioned_at`).whereNull(`${alias}.merged_into`).whereNot(`${alias}.registration_state`, "ignored");
}

function openAlertsPerDevice(db: Knex | Knex.Transaction) {
  return db("alerts")
    .whereNotNull("alerts.device_id")
    .where("alerts.resolved", false)
    .groupBy("alerts.device_id")
    .select("alerts.device_id as device_id", db.raw("COUNT(*)::int as alerts_count"));
}

function agentDeviceBase(db: Knex | Knex.Transaction, agentId: string, offlineCutoff: Date) {
  return db("devices")
    .where("devices.agent_id", agentId)
    .modify((q) => notDecommissionedNotMergedNotIgnored(q, "devices"))
    .leftJoin(openAlertsPerDevice(db).as("alerts_agg"), "alerts_agg.device_id", "devices.id")
    .select(
      "devices.id", "devices.brand", "devices.model", "devices.name", "devices.serial_number",
      "devices.ip_address", "devices.last_seen",
      // Los 4 tóners individuales (no sólo el mínimo) — la tabla pinta una
      // mini-barra por color en equipos color (handoff no lo cubre, pero es
      // funcionalidad real que ya existía antes del rediseño hifi).
      "devices.toner_black", "devices.toner_cyan", "devices.toner_magenta", "devices.toner_yellow",
      db.raw(`(${AGENT_DEVICE_ESTADO_SQL}) as estado`, [offlineCutoff]),
      db.raw(`${AGENT_CONSUMIBLE_PCT_SQL} as consumible_pct`),
      db.raw("COALESCE(alerts_agg.alerts_count, 0)::int as alerts_count")
    );
}

function agentDeviceFiltered(db: Knex | Knex.Transaction, query: AgentDeviceDirectoryQuery, offlineCutoff: Date) {
  const rows = agentDeviceBase(db, query.agentId, offlineCutoff).as("rows");
  return db.select("rows.*").from(rows).modify((q) => {
    if (query.q) {
      const term = query.q;
      q.andWhere((b) => {
        b.whereRaw("serial_number ILIKE ?", [`%${term}%`])
          .orWhereRaw("model ILIKE ?", [`%${term}%`])
          // `ip_address` es `INET` (no `text`) — sin el cast, ILIKE contra esta
          // columna tira "operator does not exist: inet ~~* unknown" (mismo
          // motivo del cast en `KnexDeviceRegistrationRepository.pendingQuery`).
          .orWhereRaw("ip_address::text ILIKE ?", [`%${term}%`]);
      });
    }
    if (query.segment === "sin_conexion") q.where("estado", "sin_conexion");
    else if (query.segment === "con_alertas") q.where("alerts_count", ">", 0);
    else if (query.segment === "sin_aprobar") q.where("estado", "sin_aprobar");
  });
}

function applyAgentDeviceSort(q: Knex.QueryBuilder, sortColumn: string, sortDir: "asc" | "desc") {
  if (sortColumn === "last_seen") q.orderByRaw(`last_seen ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
  else q.orderByRaw(`${sortColumn} ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
  q.orderBy("model", "asc");
}

/** Tabla "Equipos detectados por este monitor" — paginado/filtrado/ordenado real,
 * mismo patrón que `listDevicesDirectory` en `KnexClientRepository` pero scopeado
 * por `agent_id` e incluyendo equipos `pending` (ver `AGENT_DEVICE_ESTADO_SQL`). */
export async function listAgentDevicesDirectory(
  db: Knex | Knex.Transaction, query: AgentDeviceDirectoryQuery
): Promise<{ items: AgentDeviceDirectoryRow[]; total: number }> {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const sortColumn = AGENT_DEVICE_DIRECTORY_SORT_COLUMNS[query.sortField ?? "alerts_count"];
  const sortDir: "asc" | "desc" = query.sortDir === "asc" ? "asc" : "desc";
  // Umbral unificado (26/08/2026) — ver `AGENT_DEVICE_ESTADO_SQL`.
  const { deviceOfflineThresholdMinutes } = await readSystemSettings(db);
  const offlineCutoff = new Date(Date.now() - deviceOfflineThresholdMinutes * 60 * 1000);

  const [items, [{ count }]] = await Promise.all([
    agentDeviceFiltered(db, query, offlineCutoff).modify((q) => applyAgentDeviceSort(q, sortColumn, sortDir)).limit(limit).offset(offset),
    agentDeviceFiltered(db, query, offlineCutoff).clearSelect().count("* as count"),
  ]);
  return { items, total: Number(count) };
}
