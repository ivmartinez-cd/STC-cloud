import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type { AgentScope } from "../../domain/entities/agent";
import type { AgentDeleteSnapshot, AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";

/**
 * Columnas seguras de `agents` para el portal. Reemplaza el `agents.*` que
 * devolvía `jwt_secret`, `refresh_token_hash` y una `activation_key` VIVA a
 * cualquier rol. `activation_key` sólo para admin/operator; `jwt_secret` y
 * `refresh_token_hash` no se exponen NUNCA.
 */
export const AGENT_SAFE_COLUMNS = [
  "agents.id", "agents.client_id", "agents.name", "agents.status", "agents.last_seen", "agents.created_at",
  "agents.hardware_id", "agents.version", "agents.host_name", "agents.host_os", "agents.host_ip", "agents.uptime",
  "agents.scan_interval_minutes", "agents.remote_ews_enabled",
];

const LIST_COLUMNS = [
  "agents.id", "agents.name", "agents.hardware_id", "agents.version", "agents.host_name", "agents.host_os", "agents.host_ip",
  "agents.uptime", "agents.status", "agents.last_seen", "agents.client_id", "agents.created_at", "agents.remote_ews_enabled",
];

const CONFIG_COLUMNS = ["agents.ip_ranges", "agents.snmp_community", "agents.toner_warning_threshold", "agents.toner_critical_threshold", "agents.business_hours"];

// Volumen mensual por suma de deltas positivos (no MAX-MIN), ventana extendida
// 40 días, filtrando por los equipos de ESTE agente dentro de la subconsulta.
const MONTHLY_SUBQUERY = `
    (
      SELECT
        device_id,
        SUM(GREATEST(total_pages_delta, 0))::int AS monthly_pages,
        SUM(GREATEST(mono_pages_delta,  0))::int AS monthly_mono,
        SUM(GREATEST(color_pages_delta, 0))::int AS monthly_color
      FROM (
        SELECT
          device_id,
          time,
          total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY time) AS total_pages_delta,
          mono_pages  - LAG(mono_pages)  OVER (PARTITION BY device_id ORDER BY time) AS mono_pages_delta,
          color_pages - LAG(color_pages) OVER (PARTITION BY device_id ORDER BY time) AS color_pages_delta
        FROM readings
        WHERE time >= date_trunc('month', now()) - INTERVAL '40 days'
          AND device_id IN (SELECT id FROM devices WHERE agent_id = ? AND merged_into IS NULL)
      ) deltas
      WHERE time >= date_trunc('month', now())
      GROUP BY device_id
    ) as m
`;

export class KnexAgentPortalRepository implements AgentPortalRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  list(scope: AgentScope): Promise<unknown[]> {
    return this.db("agents").join("clients", "agents.client_id", "clients.id")
      .modify((q) => { if (scope.kind === "client") q.where("agents.client_id", scope.id); })
      .select(...LIST_COLUMNS, "clients.name as client_name")
      .orderBy("agents.created_at", "desc")
      // Techo de seguridad (auditoría de capacidad), no paginación real todavía.
      .limit(2000);
  }

  async getDetail(id: string, full: boolean): Promise<Record<string, any> | null> {
    const db = this.db;
    const columns = full ? [...AGENT_SAFE_COLUMNS, "agents.activation_key"] : AGENT_SAFE_COLUMNS;
    const count = (cond: string, alias: string) => db.raw(`COUNT(DISTINCT CASE WHEN ${cond} THEN d.id END)::int AS ${alias}`);
    const row = await db("agents").where("agents.id", id)
      .select(
        ...columns, "clients.name as client_name",
        count("d.active = true AND d.decommissioned_at IS NULL AND d.merged_into IS NULL", "active_device_count"),
        count("d.decommissioned_at IS NULL AND d.merged_into IS NULL", "total_device_count"),
        count("d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL", "decommissioned_device_count"),
        ...(full ? CONFIG_COLUMNS : [])
      )
      .leftJoin("clients", "clients.id", "agents.client_id")
      .leftJoin("devices as d", "d.agent_id", "agents.id")
      .groupBy("agents.id", "clients.name").first();
    return row ?? null;
  }

  listDevices(agentId: string, includeDecommissioned: boolean): Promise<unknown[]> {
    const db = this.db;
    return db("devices").where("devices.agent_id", agentId)
      .modify((q) => { if (!includeDecommissioned) onlyLiveDevices(q, "devices"); else q.whereNull("devices.merged_into"); })
      .leftJoin(db.raw(MONTHLY_SUBQUERY, [agentId]), "m.device_id", "devices.id")
      .leftJoin("device_usage_30d as u30", "u30.device_id", "devices.id")
      .leftJoin("device_models as dm", function () {
        this.on(db.raw("lower(dm.brand) = lower(devices.brand)")).andOn(db.raw("dm.model_key = lower(btrim(devices.model))"));
      })
      .select(
        "devices.*",
        db.raw("COALESCE(m.monthly_pages, 0) AS monthly_pages"), db.raw("COALESCE(m.monthly_mono,  0) AS monthly_mono"),
        db.raw("COALESCE(m.monthly_color, 0) AS monthly_color"), db.raw("COALESCE(u30.pages_30d, 0) AS pages_30d"),
        db.raw("COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) as duty_cycle_effective"),
        db.raw(`
        CASE WHEN COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) > 0
             THEN round(100.0 * COALESCE(u30.pages_30d, 0) / COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly))
        END as utilization_pct
      `)
      )
      .orderBy("devices.brand");
  }

  async snapshotForDelete(id: string): Promise<AgentDeleteSnapshot | null> {
    return (await this.db("agents").where({ id }).select("name", "client_id").first()) ?? null;
  }

  async deviceIdsOf(agentId: string): Promise<string[]> {
    const rows = await this.db("devices").where("agent_id", agentId).select("id");
    return rows.map((d: { id: string }) => d.id);
  }

  async anyClosureLines(deviceIds: string[]): Promise<boolean> {
    return !!(await this.db("report_closure_lines").whereIn("device_id", deviceIds).first());
  }

  async deleteCascade(agentId: string, deviceIds: string[]): Promise<void> {
    if (deviceIds.length > 0) {
      await this.db("readings").whereIn("device_id", deviceIds).delete();
      await this.db("devices").where("agent_id", agentId).delete();
    }
    await this.db("agents").where("id", agentId).delete();
  }

  async findEwsAgent(id: string) {
    return (await this.db("agents").where({ id }).select("remote_ews_enabled", "scan_interval_minutes").first()) ?? null;
  }

  async findEwsDevice(agentId: string, deviceId: string) {
    return (await this.db("devices").where({ id: deviceId, agent_id: agentId }).whereNull("decommissioned_at").whereNull("merged_into")
      .select("id", "ip_address", "last_seen").first()) ?? null;
  }

  setRemoteEwsEnabled(id: string, enabled: boolean): Promise<number> {
    return this.db("agents").where({ id }).update({ remote_ews_enabled: enabled });
  }
}
