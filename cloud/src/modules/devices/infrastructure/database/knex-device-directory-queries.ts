import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type { DeviceScope } from "../../domain/entities/device";
import type { DeviceDirectoryGroup, DeviceDirectoryRow, DeviceDirectorySegment, DeviceDirectoryResponse, DeviceDirectorySortField, SortDir } from "../../domain/entities/device-directory";
import type { ListDeviceDirectoryQuery } from "../../domain/repositories/device-repository";

const SUPPLY_LOW_THRESHOLD = 35;

/** Copia local a propósito (no se importa de `clients`/`agents`): cada módulo
 * ya trae su propia copia de este mismo cálculo (`AGENT_CONSUMIBLE_PCT_SQL`,
 * `CONSUMIBLE_PCT_SQL` en `clients`) — `arch-cross-module` prohíbe importar
 * internals de infraestructura de otro módulo. */
const CONSUMIBLE_PCT_SQL = "LEAST(devices.toner_black, devices.toner_cyan, devices.toner_magenta, devices.toner_yellow)";

/** Sólo 2 estados en vivo — a diferencia de `clients`, esta pantalla no distingue
 * "sin reporte" de "sin conexión", ambos son SIN CONTACTO acá. Umbral de 5 hs,
 * igual que `heartbeatMonitor.ts::DEVICE_OFFLINE_THRESHOLD_MINUTES`. */
const DEVICE_DIRECTORY_ESTADO_SQL = `
  CASE
    WHEN devices.decommissioned_at IS NOT NULL THEN 'dado_de_baja'
    WHEN devices.last_seen IS NULL THEN 'sin_contacto'
    WHEN devices.last_seen < NOW() - INTERVAL '5 hours' THEN 'sin_contacto'
    ELSE 'en_linea'
  END
`;

function whereScope(q: Knex.QueryBuilder, scope: DeviceScope) {
  if (scope.kind === "client") q.andWhere("devices.client_id", scope.id);
}

/** Alertas ABIERTAS por dispositivo — mismo patrón que `openAlertsPerDevice`
 * en `clients`/`agents` (copia local, ver docblock de `CONSUMIBLE_PCT_SQL`). */
function openAlertsPerDevice(db: Knex) {
  return db("alerts")
    .whereNotNull("alerts.device_id")
    .where("alerts.resolved", false)
    .groupBy("alerts.device_id")
    .select("alerts.device_id as device_id", db.raw("COUNT(*)::int as alerts_count"));
}

/** IP/serial/marca/modelo/nombre/cliente/monitor — mismo criterio que
 * `applyDeviceSearch` (`knex-device-repository.ts`), sobre columnas YA
 * aplanadas (post-wrap, ver `directoryRowsFiltered`). */
function applyDirectorySearch(q: Knex.QueryBuilder, term: string) {
  q.andWhere((b) => {
    b.whereRaw("ip_address ILIKE ?", [`%${term}%`])
      .orWhereRaw("serial_number ILIKE ?", [`%${term}%`])
      .orWhereRaw("brand ILIKE ?", [`%${term}%`])
      .orWhereRaw("model ILIKE ?", [`%${term}%`])
      .orWhereRaw("name ILIKE ?", [`%${term}%`])
      .orWhereRaw("client_name ILIKE ?", [`%${term}%`])
      .orWhereRaw("agent_name ILIKE ?", [`%${term}%`]);
  });
}

function applyDirectorySegment(q: Knex.QueryBuilder, segment?: DeviceDirectorySegment) {
  if (segment === "sin_contacto") q.where("estado", "sin_contacto");
  else if (segment === "con_alertas") q.where("alerts_count", ">", 0);
  else if (segment === "consumible_bajo") q.where("consumible_pct", "<=", SUPPLY_LOW_THRESHOLD);
  else if (segment === "sin_agente") q.whereNull("agent_id");
}

function directorySelectColumns(db: Knex) {
  return [
    "devices.id", "devices.client_id", "clients.name as client_name", "devices.name",
    "devices.brand", "devices.model", "devices.serial_number",
    // `host()`, no `::text` — el cast a texto de un `inet` incluye la
    // máscara (`/32`), `host()` da la dirección limpia (mismo patrón que
    // `device-sql.ts`/`knex-device-identity-resolver.ts`).
    db.raw("host(devices.ip_address) as ip_address"),
    "agents.id as agent_id", "agents.name as agent_name",
    db.raw(`(${DEVICE_DIRECTORY_ESTADO_SQL}) as estado`),
    "devices.toner_black", "devices.toner_cyan", "devices.toner_magenta", "devices.toner_yellow",
    db.raw(`${CONSUMIBLE_PCT_SQL} as consumible_pct`),
    "devices.last_seen", "devices.decommissioned_at",
    db.raw("COALESCE(alerts_agg.alerts_count, 0)::int as alerts_count"),
  ];
}

/** Join base + columnas derivadas, SIN filtrar por `q`/`segment` todavía —
 * Postgres no deja filtrar por un alias del mismo nivel (ver `directoryRowsFiltered`). */
function directoryRowsBase(db: Knex, query: ListDeviceDirectoryQuery) {
  return db("devices")
    .join("clients", "devices.client_id", "clients.id")
    .leftJoin("agents", "devices.agent_id", "agents.id")
    .leftJoin(openAlertsPerDevice(db).as("alerts_agg"), "alerts_agg.device_id", "devices.id")
    .modify((q) => {
      if (!query.includeDecommissioned) onlyLiveDevices(q, "devices");
      else q.whereNull("devices.merged_into");
      whereScope(q, query.scope);
    })
    .select(directorySelectColumns(db));
}

function directoryRowsFiltered(db: Knex, query: ListDeviceDirectoryQuery) {
  const rows = directoryRowsBase(db, query).as("rows");
  return db.select("rows.*").from(rows).modify((q) => {
    if (query.q) applyDirectorySearch(q, query.q);
    applyDirectorySegment(q, query.segment);
  });
}

/** Orden PRIMARIO por cliente (agrupa filas contiguas en la página), orden
 * SECUNDARIO por lo que pidió el usuario — así "agrupado por cliente" y
 * "ordenado por último contacto" conviven sin que un cliente aparezca
 * partido en 2 grupos dentro de la misma página. NULLS LAST en `last_seen`,
 * mismo motivo que `applyClientDeviceSort` (`clients`). */
function applyDirectorySort(q: Knex.QueryBuilder, sortField: DeviceDirectorySortField, sortDir: SortDir) {
  q.orderBy("client_name", "asc");
  if (sortField === "alerts_count") {
    q.orderBy("alerts_count", sortDir);
  } else {
    const DIR_SQL = sortDir === "asc" ? "ASC" : "DESC";
    q.orderByRaw(`last_seen ${DIR_SQL} NULLS LAST`);
  }
  q.orderBy("id", "asc");
}

function clusterByClient(rows: DeviceDirectoryRow[]): Array<{ id: string; name: string; rows: DeviceDirectoryRow[] }> {
  const groups: Array<{ id: string; name: string; rows: DeviceDirectoryRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.id === row.client_id) last.rows.push(row);
    else groups.push({ id: row.client_id, name: row.client_name, rows: [row] });
  }
  return groups;
}

/** Total de equipos VIVOS del cliente (ignora `q`/`segment`) — es "N dispositivos" del header de grupo. */
async function clientDeviceTotals(db: Knex, clientIds: string[], includeDecommissioned: boolean): Promise<Map<string, number>> {
  const rows: Array<{ client_id: string; count: number }> = await db("devices")
    .whereIn("client_id", clientIds)
    .modify((q) => { if (!includeDecommissioned) onlyLiveDevices(q, "devices"); else q.whereNull("merged_into"); })
    .groupBy("client_id")
    .select("client_id", db.raw("COUNT(*)::int as count"));
  return new Map(rows.map((r) => [r.client_id, Number(r.count)]));
}

/** Equipos del cliente que matchean el filtro/búsqueda actual, SIN paginar — "N en esta vista". */
async function clientInViewCounts(db: Knex, query: ListDeviceDirectoryQuery, clientIds: string[]): Promise<Map<string, number>> {
  const filtered = directoryRowsFiltered(db, query).as("f");
  const rows: Array<{ client_id: string; count: number }> = await db.select("f.client_id", db.raw("COUNT(*)::int as count"))
    .from(filtered).whereIn("f.client_id", clientIds).groupBy("f.client_id");
  return new Map(rows.map((r) => [r.client_id, Number(r.count)]));
}

/** Alertas abiertas de TODOS los equipos del cliente (no sólo los de esta vista) — "N alertas abiertas". */
async function clientOpenAlertsCounts(db: Knex, clientIds: string[]): Promise<Map<string, number>> {
  const rows: Array<{ client_id: string; count: number }> = await db("alerts")
    .join("devices", "alerts.device_id", "devices.id")
    .whereIn("devices.client_id", clientIds)
    .where("alerts.resolved", false)
    .groupBy("devices.client_id")
    .select("devices.client_id as client_id", db.raw("COUNT(*)::int as count"));
  return new Map(rows.map((r) => [r.client_id, Number(r.count)]));
}

function attachCounts(
  clusters: Array<{ id: string; name: string; rows: DeviceDirectoryRow[] }>,
  totals: Map<string, number>, inView: Map<string, number>, alerts: Map<string, number>,
): DeviceDirectoryGroup[] {
  return clusters.map((c) => ({
    id: c.id, name: c.name,
    device_count_total: totals.get(c.id) ?? c.rows.length,
    device_count_in_view: inView.get(c.id) ?? c.rows.length,
    open_alerts_count: alerts.get(c.id) ?? 0,
    rows: c.rows,
  }));
}

async function buildGroups(db: Knex, rows: DeviceDirectoryRow[], query: ListDeviceDirectoryQuery): Promise<DeviceDirectoryGroup[]> {
  const clusters = clusterByClient(rows);
  if (clusters.length === 0) return [];
  const clientIds = clusters.map((c) => c.id);
  const [totals, inView, alerts] = await Promise.all([
    clientDeviceTotals(db, clientIds, !!query.includeDecommissioned),
    clientInViewCounts(db, query, clientIds),
    clientOpenAlertsCounts(db, clientIds),
  ]);
  return attachCounts(clusters, totals, inView, alerts);
}

/** Paginado por FILA de dispositivo (no por cliente): "3 de 1.117 clientes en
 * esta página" en el mockup describe cuántos clientes CAEN dentro de la
 * página de 12 dispositivos, no un segundo eje de paginación — ver docblock
 * de `DeviceDirectoryResponse.total`. */
export async function listDeviceDirectory(db: Knex, query: ListDeviceDirectoryQuery): Promise<DeviceDirectoryResponse> {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const sortField = query.sortField ?? "last_seen";
  const sortDir: SortDir = query.sortDir === "asc" ? "asc" : "desc";

  const [rows, [{ count }]] = await Promise.all([
    directoryRowsFiltered(db, query).modify((q) => applyDirectorySort(q, sortField, sortDir)).limit(limit).offset(offset),
    directoryRowsFiltered(db, query).clearSelect().count("* as count"),
  ]);

  const groups = await buildGroups(db, rows as DeviceDirectoryRow[], query);
  return { groups, total: Number(count) };
}
