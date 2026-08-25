import type { Knex } from "knex";
import { notMerged, onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type { ClientDeviceRow, ClientMonitorRow, ClientRecord, ClientUsageMonth } from "../../domain/entities/client";
import type { ClientRepository, ClientScope } from "../../domain/repositories/client-repository";

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
