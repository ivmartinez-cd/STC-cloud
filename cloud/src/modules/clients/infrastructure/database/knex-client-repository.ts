import type { Knex } from "knex";
import { notMerged, onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type {
  ClientDeviceRow, ClientDirectoryRow, ClientMonitorRow, ClientPortfolioSummary, ClientRecord, ClientUsageMonth,
} from "../../domain/entities/client";
import type { ClientDirectoryQuery, ClientRepository, ClientScope } from "../../domain/repositories/client-repository";

function clientCountsSelect(db: Knex) {
  return [
    db.raw("COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"),
    db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count"),
    db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count"),
    db.raw("COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"),
  ];
}

// Suma de deltas positivos entre lecturas consecutivas por dispositivo (no MAX-MIN
// del mes): un reset/decremento de contador no debe inflar ni romper el volumen.
// El CTE calcula deltas sobre una ventana extendida 40 días atrás de los 4 meses
// mostrados, para que el primer delta de cada mes tome como base la última
// lectura del mes anterior; el filtro por mes se aplica después, sobre la fecha
// de la lectura actual (no sobre la que se usa como base).
const USAGE_BY_MONTH_SQL = `
    WITH deltas AS (
      SELECT
        r.time,
        r.mono_pages  - LAG(r.mono_pages)  OVER (PARTITION BY r.device_id ORDER BY r.time) AS mono_delta,
        r.color_pages - LAG(r.color_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS color_delta
      FROM readings r
      JOIN devices d ON r.device_id = d.id
      WHERE d.client_id = ?
        AND d.merged_into IS NULL
        AND r.time >= date_trunc('month', NOW() - INTERVAL '4 months') - INTERVAL '40 days'
    )
    SELECT
      to_char(date_trunc('month', time), 'Mon YYYY') AS month,
      date_trunc('month', time) AS month_date,
      SUM(GREATEST(mono_delta, 0))::int  as mono,
      SUM(GREATEST(color_delta, 0))::int as color
    FROM deltas
    WHERE time >= date_trunc('month', NOW() - INTERVAL '4 months')
    GROUP BY date_trunc('month', time)
    ORDER BY month_date ASC
`;

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

const DIRECTORY_SORT_COLUMNS: Record<NonNullable<ClientDirectoryQuery["sortField"]>, string> = {
  monitor_count: "monitor_count",
  device_count: "device_count",
  alerts_count: "alerts_count",
  last_report_at: "last_report_at",
};

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

export class KnexClientRepository implements ClientRepository {
  constructor(private readonly db: Knex) {}

  private withCounts() {
    return this.db("clients")
      .select("clients.*", ...clientCountsSelect(this.db))
      .leftJoin("agents as a", "a.client_id", "clients.id")
      .leftJoin("devices as d", "d.client_id", "clients.id")
      .groupBy("clients.id");
  }

  async exists(id: string): Promise<boolean> {
    return !!(await this.db("clients").where({ id }).first());
  }

  async insert(data: Record<string, unknown>): Promise<ClientRecord> {
    const [row] = await this.db("clients").insert(data).returning("*");
    return row;
  }

  async update(id: string, updates: Record<string, unknown>): Promise<ClientRecord> {
    const [row] = await this.db("clients").where({ id }).update(updates).returning("*");
    return row;
  }

  listWithCounts(scope: ClientScope): Promise<ClientRecord[]> {
    return this.withCounts()
      .modify((q) => { if (scope.kind === "client") q.where("clients.id", scope.id); })
      .orderBy("clients.name")
      // Techo de seguridad (auditoría de capacidad, 200+ clientes), no paginación real todavía.
      .limit(2000);
  }

  async findWithCounts(id: string): Promise<ClientRecord | null> {
    return (await this.withCounts().where("clients.id", id).first()) ?? null;
  }

  /** Alertas ABIERTAS por cliente — mismo join que `alertsForClient` en `alertDigestJob.ts`
   * (alerts → devices → agents, con `COALESCE` para alertas agent-scoped sin equipo),
   * ya agrupado por cliente para poder unirse 1:1 sin repetir filas. */
  private openAlertsPerClient() {
    return this.db("alerts")
      .leftJoin("devices", "alerts.device_id", "devices.id")
      .leftJoin("agents", "agents.id", this.db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
      .where("alerts.resolved", false)
      .whereNotNull("agents.client_id")
      .groupBy("agents.client_id")
      .select("agents.client_id as client_id", this.db.raw("COUNT(*)::int as alerts_count"));
  }

  /** Último reporte (última lectura) de cualquier equipo VIVO del cliente — mismo criterio
   * de "vivo" (`decommissioned_at`/`merged_into`) que ya usa `clientCountsSelect` arriba,
   * para no mostrar un número de "equipos" en la tabla que no case con "último reporte". */
  private lastReportPerClient() {
    return this.db("devices")
      .whereNull("devices.decommissioned_at")
      .whereNull("devices.merged_into")
      .groupBy("devices.client_id")
      .select("devices.client_id as client_id", this.db.raw("MAX(devices.last_seen) as last_report_at"));
  }

  /** Por-cliente: conteos + alertas abiertas + último reporte, SIN `estado` todavía — base
   * compartida por `listDirectory` y `getPortfolioSummary` para que ambos endpoints nunca
   * se desincronicen en cómo cuentan lo mismo. */
  private directoryAggregate(scope: ClientScope) {
    return this.db("clients")
      .leftJoin("agents as a", "a.client_id", "clients.id")
      .leftJoin("devices as d", "d.client_id", "clients.id")
      .leftJoin(this.openAlertsPerClient().as("alerts_agg"), "alerts_agg.client_id", "clients.id")
      .leftJoin(this.lastReportPerClient().as("report_agg"), "report_agg.client_id", "clients.id")
      .modify((q) => { if (scope.kind === "client") q.where("clients.id", scope.id); })
      .groupBy("clients.id")
      .select(
        "clients.id", "clients.name", "clients.contact_name", "clients.contact_email", "clients.country",
        ...clientCountsSelect(this.db),
        this.db.raw("COALESCE(MAX(alerts_agg.alerts_count), 0)::int as alerts_count"),
        this.db.raw("MAX(report_agg.last_report_at) as last_report_at")
      );
  }

  /** `directoryAggregate` + `estado` ya materializado como columna real (no un alias de
   * SELECT: Postgres no deja filtrar/ordenar por un alias del mismo nivel en WHERE, así
   * que se envuelve un nivel para que `estado`/`alerts_count` sean columnas normales del
   * nivel siguiente — ver `listDirectory`). */
  private directoryWithEstado(scope: ClientScope) {
    const agg = this.directoryAggregate(scope).as("agg");
    return this.db.select("agg.*", this.db.raw(`(${ESTADO_CASE_SQL}) as estado`)).from(agg);
  }

  /** `q`/`segment` sobre columnas ya reales de `rows` (ver `directoryWithEstado`). */
  private applyDirectoryFilters(q: Knex.QueryBuilder, query: ClientDirectoryQuery) {
    if (query.q) applyClientDirectorySearch(q, query.q);
    if (query.segment === "sin_contacto") q.where("estado", "sin_contacto");
    else if (query.segment === "con_alertas") q.where("alerts_count", ">", 0);
    else if (query.segment === "sin_reporte_24h") q.where("estado", "sin_reporte");
  }

  private directoryFiltered(query: ClientDirectoryQuery) {
    const rows = this.directoryWithEstado(query.scope).as("rows");
    return this.db.select("rows.*").from(rows).modify((q) => this.applyDirectoryFilters(q, query));
  }

  /** Los NULL de `last_report_at` ("nunca reportó") siempre al final, sin importar la
   * dirección — de lo contrario DESC (default de Postgres para NULL) los pondría
   * primero al ordenar por "más reciente", justo lo opuesto de lo esperado. */
  private applyDirectorySort(q: Knex.QueryBuilder, sortColumn: string, sortDir: "asc" | "desc") {
    if (sortColumn === "last_report_at") q.orderByRaw(`last_report_at ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
    else q.orderBy(sortColumn, sortDir);
    q.orderBy("name", "asc");
  }

  /** Paginado/filtrado/ordenado (handoff hifi "Clientes", 25/08/2026 — mismo criterio de
   * `{items, total}`/techo 200 que `DeviceRepository.list()`). */
  async listDirectory(query: ClientDirectoryQuery): Promise<{ items: ClientDirectoryRow[]; total: number }> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const sortColumn = DIRECTORY_SORT_COLUMNS[query.sortField ?? "device_count"];
    const sortDir: "asc" | "desc" = query.sortDir === "asc" ? "asc" : "desc";

    const [items, [{ count }]] = await Promise.all([
      this.directoryFiltered(query).modify((q) => this.applyDirectorySort(q, sortColumn, sortDir)).limit(limit).offset(offset),
      this.directoryFiltered(query).clearSelect().count("* as count"),
    ]);
    return { items, total: Number(count) };
  }

  /** Tira de métricas de cartera — reusa `directoryWithEstado` (sin filtros/paginación)
   * para que nunca se desincronice con lo que muestra la tabla, y agrega en JS (una sola
   * lectura de ~N clientes, liviana: no vale la pena una segunda query SQL para el top 5). */
  async getPortfolioSummary(scope: ClientScope): Promise<ClientPortfolioSummary> {
    const rows: PortfolioAggRow[] =
      await this.db.select("contact_name", "monitor_count", "device_count", "alerts_count").from(this.directoryWithEstado(scope).as("rows"));
    return summarizePortfolioRows(rows);
  }

  listMonitors(clientId: string, includeIpRanges: boolean): Promise<ClientMonitorRow[]> {
    return this.db("agents")
      .where("agents.client_id", clientId)
      .select(
        "agents.id", "agents.name", "agents.status", "agents.last_seen", "agents.hardware_id",
        "agents.host_name", "agents.scan_interval_minutes",
        ...(includeIpRanges ? ["agents.ip_ranges"] : []),
        this.db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count")
      )
      .leftJoin("devices as d", "d.agent_id", "agents.id")
      .groupBy("agents.id")
      .orderBy("agents.name");
  }

  async usageByMonth(clientId: string): Promise<ClientUsageMonth[]> {
    const result = await this.db.raw(USAGE_BY_MONTH_SQL, [clientId]);
    return result.rows as ClientUsageMonth[];
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
  listDevices(clientId: string, includeDecommissioned: boolean): Promise<ClientDeviceRow[]> {
    return this.db("devices")
      .leftJoin("agents", "devices.agent_id", "agents.id")
      .where("devices.client_id", clientId)
      .modify((q) => { if (!includeDecommissioned) onlyLiveDevices(q, "devices"); else notMerged(q, "devices"); })
      .select(
        "devices.*",
        this.db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
        "agents.name as monitor_name",
        "agents.last_seen as monitor_last_seen"
      )
      .orderBy("devices.brand")
      .limit(500);
  }
}
