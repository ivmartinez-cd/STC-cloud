import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import { auditActionMeta } from "../../../../shared/domain/audit-action-catalog";
import type { AgentScope } from "../../domain/entities/agent";
import type {
  AgentActivityEvent, AgentDeviceDirectoryQuery, AgentDeviceDirectoryRow, AgentDeviceSortField, AgentLicense, AgentStats, ConnectivityDay,
} from "../../domain/entities/monitor-detail";
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

/** `estado` de un dispositivo en el detalle de MONITOR — a diferencia de
 * `DEVICE_ESTADO_SQL` en `knex-client-repository.ts`, acá SÍ hay un 3er estado
 * (`sin_aprobar`) porque esta tabla, a propósito, no usa `onlyLiveDevices()`
 * (que excluye `pending`) — el hifi pide ver los descubiertos sin aprobar en
 * la misma tabla, con su propio chip. Mismo umbral de 5 h que `heartbeatMonitor.ts`. */
const AGENT_DEVICE_ESTADO_SQL = `
  CASE
    WHEN devices.registration_state = 'pending' THEN 'sin_aprobar'
    WHEN devices.last_seen IS NULL OR devices.last_seen < NOW() - INTERVAL '5 hours' THEN 'sin_conexion'
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
function notDecommissionedNotMergedNotIgnored(q: Knex.QueryBuilder, alias = "devices"): Knex.QueryBuilder {
  return q.whereNull(`${alias}.decommissioned_at`).whereNull(`${alias}.merged_into`).whereNot(`${alias}.registration_state`, "ignored");
}

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

// Conteos de dispositivos del agente por estado, como SQL literal (sin
// interpolación: ni las condiciones ni los alias son variables).
const DEVICE_COUNT_EXPRESSIONS = [
  "COUNT(DISTINCT CASE WHEN d.active = true AND d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS active_device_count",
  "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS total_device_count",
  "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count",
] as const;

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
    const row = await db("agents").where("agents.id", id)
      .select(
        ...columns, "clients.name as client_name",
        ...DEVICE_COUNT_EXPRESSIONS.map((sql) => db.raw(sql)),
        ...(full ? CONFIG_COLUMNS : [])
      )
      .leftJoin("clients", "clients.id", "agents.client_id")
      .leftJoin("devices as d", "d.agent_id", "agents.id")
      .groupBy("agents.id", "clients.name").first();
    return row ?? null;
  }

  /** Techo de seguridad (R9 gap analysis vs HP SDS) — no tenía límite alguno; ver el mismo criterio en `KnexClientRepository.listDevices`. */
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
      .orderBy("devices.brand")
      .limit(1000);
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

  // ── Detalle de monitor hifi (handoff "Monitor — detalle", 25/08/2026) ──────

  private openAlertsPerDevice() {
    return this.db("alerts")
      .whereNotNull("alerts.device_id")
      .where("alerts.resolved", false)
      .groupBy("alerts.device_id")
      .select("alerts.device_id as device_id", this.db.raw("COUNT(*)::int as alerts_count"));
  }

  private agentDeviceBase(agentId: string) {
    return this.db("devices")
      .where("devices.agent_id", agentId)
      .modify((q) => notDecommissionedNotMergedNotIgnored(q, "devices"))
      .leftJoin(this.openAlertsPerDevice().as("alerts_agg"), "alerts_agg.device_id", "devices.id")
      .select(
        "devices.id", "devices.brand", "devices.model", "devices.name", "devices.serial_number",
        "devices.ip_address", "devices.last_seen",
        this.db.raw(`(${AGENT_DEVICE_ESTADO_SQL}) as estado`),
        this.db.raw(`${AGENT_CONSUMIBLE_PCT_SQL} as consumible_pct`),
        this.db.raw("COALESCE(alerts_agg.alerts_count, 0)::int as alerts_count")
      );
  }

  private agentDeviceFiltered(query: AgentDeviceDirectoryQuery) {
    const rows = this.agentDeviceBase(query.agentId).as("rows");
    return this.db.select("rows.*").from(rows).modify((q) => {
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

  private applyAgentDeviceSort(q: Knex.QueryBuilder, sortColumn: string, sortDir: "asc" | "desc") {
    if (sortColumn === "last_seen") q.orderByRaw(`last_seen ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
    else q.orderByRaw(`${sortColumn} ${sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST`);
    q.orderBy("model", "asc");
  }

  /** Tabla "Equipos detectados por este monitor" — paginado/filtrado/ordenado real,
   * mismo patrón que `listDevicesDirectory` en `KnexClientRepository` pero scopeado
   * por `agent_id` e incluyendo equipos `pending` (ver `AGENT_DEVICE_ESTADO_SQL`). */
  async listDevicesDirectory(query: AgentDeviceDirectoryQuery): Promise<{ items: AgentDeviceDirectoryRow[]; total: number }> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const sortColumn = AGENT_DEVICE_DIRECTORY_SORT_COLUMNS[query.sortField ?? "alerts_count"];
    const sortDir: "asc" | "desc" = query.sortDir === "asc" ? "asc" : "desc";

    const [items, [{ count }]] = await Promise.all([
      this.agentDeviceFiltered(query).modify((q) => this.applyAgentDeviceSort(q, sortColumn, sortDir)).limit(limit).offset(offset),
      this.agentDeviceFiltered(query).clearSelect().count("* as count"),
    ]);
    return { items, total: Number(count) };
  }

  /** Alertas abiertas de ESTE agente (equipos propios + alertas agent-scoped como
   * `agent_offline`) — mismo `COALESCE(devices.agent_id, alerts.agent_id)` que
   * `alertsForClient()`/`openAlertsSummaryQuery` en el módulo `clients`, pero
   * comparado directo contra `agentId` (no hace falta subir hasta `clients`). */
  private openAlertsSummaryForAgent(agentId: string) {
    return this.db("alerts")
      .leftJoin("devices", "alerts.device_id", "devices.id")
      .where((b) => b.where("devices.agent_id", agentId).orWhere("alerts.agent_id", agentId))
      .andWhere("alerts.resolved", false)
      .select(
        this.db.raw("COUNT(*)::int as alerts_open"),
        this.db.raw("COUNT(*) FILTER (WHERE alerts.alert_class = 'availability')::int as alerts_availability")
      )
      .first();
  }

  /** Equipos GESTIONADOS (`onlyLiveDevices` ya excluye `pending`) de este agente,
   * activos vs. offline por el mismo umbral de 5 h que el resto del sistema. */
  private managedDeviceCountsForAgent(agentId: string) {
    const db = this.db;
    return db("devices")
      .where("devices.agent_id", agentId)
      .modify((q) => onlyLiveDevices(q, "devices"))
      .select(
        db.raw("COUNT(*)::int as total"),
        db.raw("COUNT(*) FILTER (WHERE devices.last_seen IS NOT NULL AND devices.last_seen >= NOW() - INTERVAL '5 hours')::int as active")
      )
      .first();
  }

  private pendingDeviceCountForAgent(agentId: string) {
    return this.db("devices")
      .where("devices.agent_id", agentId)
      .andWhere("devices.registration_state", "pending")
      .modify((q) => notDecommissionedNotMergedNotIgnored(q, "devices"))
      .count("* as count")
      .first();
  }

  /** Volumen del mes por SUMA de deltas positivos (no MAX-MIN) — mismo criterio que
   * `MONTHLY_SUBQUERY` de arriba, pero sumado en una sola fila para todo el agente. */
  private async monthlyVolumeForAgent(agentId: string): Promise<number> {
    const { rows } = await this.db.raw(
      `
      SELECT COALESCE(SUM(GREATEST(total_pages_delta, 0)), 0)::int AS monthly_pages
      FROM (
        SELECT
          time,
          total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY time) AS total_pages_delta
        FROM readings
        WHERE time >= date_trunc('month', now()) - INTERVAL '40 days'
          AND device_id IN (SELECT id FROM devices WHERE agent_id = ? AND merged_into IS NULL)
      ) deltas
      WHERE time >= date_trunc('month', now())
      `,
      [agentId]
    );
    return Number(rows[0]?.monthly_pages ?? 0);
  }

  /** Último barrido exitoso (`RESCAN`/`FORCE_SCAN` completado) — real, de `agent_commands`. */
  private lastSweepForAgent(agentId: string) {
    return this.db("agent_commands")
      .where("agent_id", agentId)
      .whereIn("type", ["RESCAN", "FORCE_SCAN"])
      .andWhere("status", "success")
      .whereNotNull("executed_at")
      .orderBy("executed_at", "desc")
      .select("executed_at")
      .first();
  }

  /** Episodios `agent_offline` que se solapan con la ventana [since, ahora] —
   * abiertos sin resolver, o resueltos DENTRO de la ventana (uno resuelto antes
   * de `since` no aporta caída dentro de la ventana). */
  private agentOfflineEpisodesSince(agentId: string, since: Date) {
    return this.db("alerts")
      .where("agent_id", agentId)
      .andWhere("type", "agent_offline")
      .andWhere((q) => q.whereNull("resolved_at").orWhere("resolved_at", ">=", since))
      .select("created_at", "resolved_at");
  }

  /** Deriva la tira de 30 días + los totales de conectividad (ver docblock de
   * `ConnectivityDay`) a partir de los mismos episodios — un solo query reusado
   * por `getConnectivity30d()` y `getStats()`. */
  private async computeConnectivityWindow(
    agentId: string, days: number
  ): Promise<{ perDay: ConnectivityDay[]; totalDowntimeMinutes: number; episodeCount: number }> {
    const agentRow = await this.db("agents").where("id", agentId).select("created_at").first();
    const createdAt: Date = agentRow?.created_at ?? new Date(0);
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
    const episodes: Array<{ created_at: Date; resolved_at: Date | null }> = await this.agentOfflineEpisodesSince(agentId, since);

    const perDay: ConnectivityDay[] = [];
    let totalDowntimeMinutes = 0;
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      let downtimeMs = 0;
      let reconnects = 0;
      for (const ep of episodes) {
        const epStart = ep.created_at > dayStart ? ep.created_at : dayStart;
        const epEnd = (ep.resolved_at ?? now) < dayEnd ? (ep.resolved_at ?? now) : dayEnd;
        if (epEnd > epStart) downtimeMs += epEnd.getTime() - epStart.getTime();
        if (ep.resolved_at && ep.resolved_at >= dayStart && ep.resolved_at < dayEnd) reconnects++;
      }
      const downtimeMinutes = Math.round(downtimeMs / 60_000);
      totalDowntimeMinutes += downtimeMinutes;
      const status: ConnectivityDay["status"] =
        dayEnd <= createdAt || downtimeMinutes >= 23 * 60 ? "sin_contacto" : downtimeMinutes > 0 ? "parcial" : "online";
      perDay.push({ date: dayStart.toISOString().slice(0, 10), status, downtime_minutes: downtimeMinutes, reconnects });
    }
    // "Cortes" = episodios que se solapan con la ventana completa (no por día).
    const episodeCount = episodes.length;
    return { perDay, totalDowntimeMinutes, episodeCount };
  }

  async getConnectivity30d(agentId: string): Promise<ConnectivityDay[]> {
    const { perDay } = await this.computeConnectivityWindow(agentId, 30);
    return perDay;
  }

  async getStats(agentId: string): Promise<AgentStats> {
    const [managed, alertsSummary, pending, volumeMonth, lastSweep, connectivity] = await Promise.all([
      this.managedDeviceCountsForAgent(agentId),
      this.openAlertsSummaryForAgent(agentId),
      this.pendingDeviceCountForAgent(agentId),
      this.monthlyVolumeForAgent(agentId),
      this.lastSweepForAgent(agentId),
      this.computeConnectivityWindow(agentId, 30),
    ]);

    const total = Number(managed?.total ?? 0);
    const active = Number(managed?.active ?? 0);
    const lastSweepAt: Date | null = lastSweep?.executed_at ?? null;
    let lastSweepNewCount = 0;
    if (lastSweepAt) {
      const row = await this.db("devices").where("agent_id", agentId).andWhere("created_at", ">=", lastSweepAt).count("* as count").first();
      lastSweepNewCount = Number(row?.count ?? 0);
    }

    const windowMinutes = 30 * 24 * 60;
    const uptimePct = windowMinutes > 0 ? Math.round((1 - connectivity.totalDowntimeMinutes / windowMinutes) * 1000) / 10 : 100;

    return {
      devices_total: total,
      devices_active: active,
      devices_offline: Math.max(0, total - active),
      alerts_open: Number(alertsSummary?.alerts_open ?? 0),
      alerts_availability: Number(alertsSummary?.alerts_availability ?? 0),
      volume_month: volumeMonth,
      uptime_30d_pct: Math.max(0, Math.min(100, uptimePct)),
      outages_30d: connectivity.episodeCount,
      downtime_30d_minutes: connectivity.totalDowntimeMinutes,
      discovered_pending: Number(pending?.count ?? 0),
      last_sweep_at: lastSweepAt,
      last_sweep_new_count: lastSweepNewCount,
    };
  }

  /** "Actividad reciente" — compone 3 fuentes reales (nada inventado): alertas
   * abiertas/resueltas de este agente y sus equipos, acciones administrativas
   * auditadas sobre este agente (`audit_logs.target_id`), y comandos remotos
   * completados (`agent_commands`). Ordenado por fecha desc, recortado a `limit`. */
  async getRecentActivity(agentId: string, limit: number): Promise<AgentActivityEvent[]> {
    const db = this.db;
    const fetchLimit = Math.max(limit, 10);
    const [alertRows, auditRows, commandRows] = await Promise.all([
      db("alerts")
        .leftJoin("devices", "alerts.device_id", "devices.id")
        .where((b) => b.where("devices.agent_id", agentId).orWhere("alerts.agent_id", agentId))
        .orderBy("alerts.created_at", "desc")
        .limit(fetchLimit)
        .select(
          "alerts.id as id", "alerts.type as type", "alerts.message as message", "alerts.created_at as created_at",
          "alerts.resolved as resolved", "alerts.resolved_at as resolved_at", "devices.model as device_model"
        ),
      db("audit_logs")
        .where("target_id", agentId)
        .orderBy("created_at", "desc")
        .limit(fetchLimit)
        .leftJoin("users", "users.id", "audit_logs.user_id")
        .select("audit_logs.id as id", "audit_logs.action as action", "audit_logs.created_at as created_at", "users.username as user_username"),
      db("agent_commands")
        .where("agent_id", agentId)
        .whereIn("status", ["success", "error"])
        .whereNotNull("executed_at")
        .orderBy("executed_at", "desc")
        .limit(fetchLimit)
        .select("id", "type", "status", "executed_at"),
    ]);

    const events: AgentActivityEvent[] = [];

    for (const a of alertRows as Array<{ id: number; type: string; message: string | null; created_at: Date; resolved: boolean; resolved_at: Date | null; device_model: string | null }>) {
      const subject = a.device_model ?? "El monitor";
      const isAgentOffline = a.type === "agent_offline";
      events.push({
        id: `alert-open-${a.id}`,
        kind: isAgentOffline ? "incidencia" : "incidencia",
        text: isAgentOffline ? "Monitor sin señal" : `${subject}: ${a.message ?? "alerta abierta"}`,
        at: a.created_at,
      });
      if (a.resolved && a.resolved_at) {
        events.push({
          id: `alert-resolve-${a.id}`,
          kind: isAgentOffline ? "barrido" : "administrativo",
          text: isAgentOffline ? "Monitor reconectado" : `${subject}: alerta resuelta`,
          at: a.resolved_at,
        });
      }
    }
    for (const r of auditRows as Array<{ id: string; action: string; created_at: Date; user_username: string | null }>) {
      const label = auditActionMeta(r.action).label;
      events.push({
        id: `audit-${r.id}`, kind: "administrativo",
        text: r.user_username ? `${label} · ${r.user_username}` : label,
        at: r.created_at,
      });
    }
    const COMMAND_LABELS: Record<string, string> = {
      RESCAN: "Barrido de red completado", FORCE_SCAN: "Barrido de red completado",
      RESTART: "Agente reiniciado", FORCE_UPDATE: "Agente actualizado", UPDATE_CONFIG: "Configuración aplicada", STC_CONSOLE: "Comando de consola ejecutado",
    };
    for (const c of commandRows as Array<{ id: string; type: string; status: string; executed_at: Date }>) {
      events.push({
        id: `cmd-${c.id}`,
        kind: c.status === "success" ? "barrido" : "incidencia",
        text: `${COMMAND_LABELS[c.type] ?? c.type}${c.status === "error" ? " (con errores)" : ""}`,
        at: c.executed_at,
      });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    return events.slice(0, limit);
  }

  async getLicense(agentId: string): Promise<AgentLicense | null> {
    const db = this.db;
    const agent = await db("agents").where("id", agentId).select("status", "hardware_id", "created_at", "client_id").first();
    if (!agent) return null;

    const [client, orgCounts] = await Promise.all([
      db("clients").where("id", agent.client_id).select("id", "name").first(),
      db("agents")
        .where("client_id", agent.client_id)
        .select(
          db.raw(
            "(SELECT COUNT(*) FROM devices WHERE devices.client_id = ? AND devices.decommissioned_at IS NULL AND devices.merged_into IS NULL)::int as device_count",
            [agent.client_id]
          ),
          db.raw("COUNT(*) FILTER (WHERE agents.status != 'revoked')::int as monitor_count")
        )
        .first(),
    ]);

    const ROTATION_DAYS = 90;
    const msPerDay = 24 * 60 * 60 * 1000;
    const emitidaAt: Date = agent.created_at;
    let nextRotationMs = emitidaAt.getTime() + ROTATION_DAYS * msPerDay;
    const now = Date.now();
    while (nextRotationMs <= now) nextRotationMs += ROTATION_DAYS * msPerDay;

    return {
      estado: agent.status === "revoked" ? "revocada" : "vigente",
      hardware_id: agent.hardware_id,
      emitida_at: emitidaAt,
      proxima_rotacion_at: new Date(nextRotationMs),
      rotacion_dias: ROTATION_DAYS,
      organizacion: {
        id: client?.id ?? agent.client_id,
        nombre: client?.name ?? "—",
        device_count: Number(orgCounts?.device_count ?? 0),
        monitor_count: Number(orgCounts?.monitor_count ?? 0),
      },
    };
  }
}
