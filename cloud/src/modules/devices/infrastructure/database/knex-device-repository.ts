import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type { AgentRow, DeviceRow, DeviceScope, StaleDeviceRow } from "../../domain/entities/device";
import type { DeviceStats, PrintTrendMonth } from "../../domain/entities/device-detail";
import type { DecommissionFields, DeviceRepository, ListDevicesQuery, ReadingsQuery, UsageHistoryQuery } from "../../domain/repositories/device-repository";
import { extractTrayLabel } from "../../domain/services/jam-tray";
import { UUID_RE } from "../../domain/services/device-rules";
import {
  DEVICE_JAMS_30D_SQL, DEVICE_MONTH_VOLUME_SQL, DUPLICATES_SQL, PRINT_TREND_SQL, SITE_MONTH_VOLUME_SQL, duplicatesBindings,
} from "./device-sql";

const STATUS_SQL = "CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status";

/** uuid exacto, prefijo de uuid, serial o (opcionalmente) IP. */
function whereIdentifier(q: Knex.QueryBuilder, identifier: string, allowIp: boolean) {
  q.where(function () {
    if (UUID_RE.test(identifier)) { this.where("devices.id", identifier); return; }
    this.whereRaw("devices.id::text LIKE ?", [`${identifier}%`]).orWhere("devices.serial_number", identifier);
    if (allowIp) this.orWhereRaw("devices.ip_address::text = ?", [identifier]);
  });
}

function whereScope(q: Knex.QueryBuilder, scope: DeviceScope, column = "devices.client_id") {
  if (scope.kind === "client") q.andWhere(column, scope.id);
}

/** IP, serial, marca, modelo, nombre, cliente o monitor — ILIKE OR'd, mismo criterio que `pendingQuery` en `device-registration-repository.ts`. */
function applyDeviceSearch(q: Knex.QueryBuilder, term: string) {
  q.andWhere((b) => {
    b.whereRaw("devices.ip_address::text ILIKE ?", [`%${term}%`])
      .orWhereRaw("devices.serial_number ILIKE ?", [`%${term}%`])
      .orWhereRaw("devices.brand ILIKE ?", [`%${term}%`])
      .orWhereRaw("devices.model ILIKE ?", [`%${term}%`])
      .orWhereRaw("devices.name ILIKE ?", [`%${term}%`])
      .orWhereRaw("clients.name ILIKE ?", [`%${term}%`])
      .orWhereRaw("agents.name ILIKE ?", [`%${term}%`]);
  });
}

export class KnexDeviceRepository implements DeviceRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  private baseListQuery(query: ListDevicesQuery) {
    return this.db("devices")
      .join("agents", "devices.agent_id", "agents.id")
      .join("clients", "devices.client_id", "clients.id")
      .modify((q) => {
        if (!query.includeDecommissioned) onlyLiveDevices(q, "devices");
        else q.whereNull("devices.merged_into"); // las lápidas nunca se listan
        whereScope(q, query.scope);
      })
      .modify((q) => { if (query.q) applyDeviceSearch(q, query.q); });
  }

  /** Paginado (R9 gap analysis: "sin paginación ninguna tabla del portal") — mismo criterio que `listPending` en `device-registration-repository.ts`. */
  async list(query: ListDevicesQuery): Promise<{ items: DeviceRow[]; total: number }> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const [items, [{ count }]] = await Promise.all([
      this.baseListQuery(query)
        .select("devices.*", this.db.raw(STATUS_SQL), "agents.name as monitor_name", "agents.status as agent_status",
          "agents.last_seen as agent_last_seen", "clients.name as client_name")
        .orderBy("clients.name").limit(limit).offset(offset),
      this.baseListQuery(query).count("devices.id as count"),
    ]);
    return { items, total: Number(count) };
  }

  async getDetail(identifier: string, scope: DeviceScope): Promise<DeviceRow | null> {
    const db = this.db;
    const row = await db("devices")
      .modify((q) => { whereIdentifier(q, identifier, true); whereScope(q, scope); })
      .select(
        "devices.*", db.raw(STATUS_SQL), "agents.name as monitor_name", "agents.status as agent_status",
        "agents.last_seen as agent_last_seen", "clients.name as client_name", "merged_target.serial_number as merged_into_serial",
        "u30.pages_30d", "u30.mono_30d", "u30.color_30d",
        db.raw("COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) as duty_cycle_effective"),
        db.raw(`
        CASE WHEN COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) > 0
             THEN round(100.0 * COALESCE(u30.pages_30d, 0) / COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly))
        END as utilization_pct
      `)
      )
      .leftJoin("agents", "agents.id", "devices.agent_id")
      .join("clients", "clients.id", "devices.client_id")
      .leftJoin("devices as merged_target", "merged_target.id", "devices.merged_into")
      .leftJoin("device_usage_30d as u30", "u30.device_id", "devices.id")
      .leftJoin("device_models as dm", function () {
        this.on(db.raw("lower(dm.brand) = lower(devices.brand)")).andOn(db.raw("dm.model_key = lower(btrim(devices.model))"));
      })
      .first();
    return row ?? null;
  }

  async resolveId(identifier: string, scope: DeviceScope, allowIp: boolean): Promise<string | null> {
    const row = await this.db("devices")
      .modify((q) => { whereIdentifier(q, identifier, allowIp); whereScope(q, scope); })
      .select("devices.id").first();
    return row?.id ?? null;
  }

  readings(deviceId: string, query: ReadingsQuery): Promise<unknown[]> {
    const q = this.db("readings")
      .where({ device_id: deviceId }).whereNotNull("total_pages").where("total_pages", ">", 0)
      .orderBy("time", "desc").limit(Math.min(Number(query.limit) || 500, 5000));
    if (query.from) q.where("time", ">=", new Date(query.from));
    if (query.to) q.where("time", "<=", new Date(query.to));
    return q.select("*", this.db.raw("CASE WHEN offline = true THEN 'offline' ELSE 'online' END as status"));
  }

  usageHistory(deviceId: string, query: UsageHistoryQuery): Promise<unknown[]> {
    const isMonthly = query.granularity === "monthly";
    const bucketCol = isMonthly ? "month" : "day";
    return this.db(isMonthly ? "readings_monthly_agg" : "readings_daily_agg")
      .where({ device_id: deviceId }).orderBy(bucketCol, "desc").limit(Math.min(Number(query.limit) || 90, 365))
      .select(`${bucketCol} as period`, "total_pages", "mono_pages", "color_pages", "reading_count",
        ...(isMonthly ? [] : ["toner_black", "toner_cyan", "toner_magenta", "toner_yellow"]));
  }

  async duplicates(clientId: string, agentId?: string): Promise<unknown[]> {
    const rows = await this.db.raw(DUPLICATES_SQL(!!agentId), duplicatesBindings(clientId, agentId));
    return rows.rows;
  }

  /** `null`/0 si el sitio no imprimió nada este mes — evita división por cero, nunca "Infinity%". */
  private static pct(part: number, whole: number): number | null {
    return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
  }

  private static jamsSummary(row: { jams_30d?: number; last_jam_at?: Date | null; last_jam_message?: string | null } | undefined) {
    return {
      count_30d: Number(row?.jams_30d ?? 0),
      last_at: row?.last_jam_at ?? null,
      tray_label: extractTrayLabel(row?.last_jam_message ?? null),
    };
  }

  private static shapeStats(
    device: { total_pages: unknown; mono_pages: unknown; color_pages: unknown } | undefined,
    volumeMonth: number, siteVolumeMonth: number, jamsRow: Parameters<typeof KnexDeviceRepository.jamsSummary>[0],
  ): Omit<DeviceStats, "lowest_supply"> {
    const total = Number(device?.total_pages ?? 0);
    const mono = Number(device?.mono_pages ?? 0);
    const color = Number(device?.color_pages ?? 0);
    return {
      total_counter: total, volume_month: volumeMonth, volume_month_site_pct: KnexDeviceRepository.pct(volumeMonth, siteVolumeMonth),
      mono_pages: mono, mono_pct: KnexDeviceRepository.pct(mono, total),
      color_pages: color, color_pct: KnexDeviceRepository.pct(color, total),
      jams: KnexDeviceRepository.jamsSummary(jamsRow),
    };
  }

  async statsRaw(deviceId: string): Promise<Omit<DeviceStats, "lowest_supply">> {
    const [device, monthRow, siteRow, jamsRow] = await Promise.all([
      this.db("devices").where({ id: deviceId }).select("total_pages", "mono_pages", "color_pages").first(),
      this.db.raw(DEVICE_MONTH_VOLUME_SQL, [deviceId]),
      this.db.raw(SITE_MONTH_VOLUME_SQL, [deviceId]),
      this.db.raw(DEVICE_JAMS_30D_SQL, [deviceId]),
    ]);
    return KnexDeviceRepository.shapeStats(
      device, Number(monthRow.rows[0]?.volume_month ?? 0), Number(siteRow.rows[0]?.site_volume_month ?? 0), jamsRow.rows[0],
    );
  }

  async printTrend(deviceId: string): Promise<PrintTrendMonth[]> {
    const { rows } = await this.db.raw(PRINT_TREND_SQL, [deviceId]);
    return rows.map((r: { month: string; month_date: Date; mono: string; color: string; total: string }) => ({
      month: r.month, month_date: r.month_date, mono: Number(r.mono), color: Number(r.color), total: Number(r.total),
    }));
  }

  async findOwned(id: string, scope: DeviceScope, forUpdate = false): Promise<DeviceRow | null> {
    const q = this.db("devices").where({ id }).modify((b) => whereScope(b, scope, "client_id"));
    if (forUpdate) q.forUpdate();
    return (await q.first()) ?? null;
  }

  async findManyOwned(ids: string[], scope: DeviceScope, forUpdate = false): Promise<Map<string, DeviceRow>> {
    const q = this.db("devices").whereIn("id", ids).modify((b) => whereScope(b, scope, "client_id"));
    if (forUpdate) q.forUpdate();
    const rows: DeviceRow[] = await q;
    return new Map(rows.map((r) => [r.id, r]));
  }

  async countOwned(ids: string[], clientId: string): Promise<number> {
    const row = await this.db("devices").whereIn("id", ids).where("client_id", clientId).count("id as c").first();
    return Number(row?.c);
  }

  async findAgent(agentId: string): Promise<AgentRow | null> {
    return (await this.db("agents").where({ id: agentId }).first()) ?? null;
  }

  async update(id: string, updates: Record<string, unknown>): Promise<DeviceRow> {
    const [row] = await this.db("devices").where({ id }).update(updates).returning("*");
    return row;
  }

  async hasClosureLines(id: string): Promise<boolean> {
    return !!(await this.db("report_closure_lines").where({ device_id: id }).first());
  }

  async isMergeTarget(id: string): Promise<boolean> {
    return !!(await this.db("devices").where({ merged_into: id }).first());
  }

  async hardDelete(id: string): Promise<number> {
    await this.db("readings").where("device_id", id).del();
    await this.db("alerts").where("device_id", id).del();
    return this.db("devices").where("id", id).del();
  }

  async setDecommissioned(ids: string[], fields: DecommissionFields): Promise<void> {
    await this.db("devices").whereIn("id", ids).update({
      decommissioned_at: new Date(), decommissioned_by: fields.by, decommission_reason: fields.reason, active: false,
    });
  }

  async clearDecommissioned(ids: string[]): Promise<void> {
    await this.db("devices").whereIn("id", ids).update({ decommissioned_at: null, decommissioned_by: null, decommission_reason: null });
  }

  async reassign(ids: string[], agentId: string, clientId: string): Promise<void> {
    await this.db("devices").whereIn("id", ids).update({ agent_id: agentId, client_id: clientId, agent_reassigned_at: new Date() });
  }

  resolveOpenAlerts(deviceIds: string[]): Promise<number> {
    return this.db("alerts").whereIn("device_id", deviceIds).where("resolved", false).update({ resolved: true, resolved_at: new Date() });
  }

  findStale(agentId: string, cutoff: Date): Promise<StaleDeviceRow[]> {
    return this.db("devices").where("agent_id", agentId)
      .modify((q) => onlyLiveDevices(q, "devices"))
      .whereRaw("COALESCE(last_seen, created_at) < ?", [cutoff])
      .select("id", "serial_number", "model", "ip_address", "last_seen", "client_id");
  }

  async findSerialCollision(clientId: string, serial: string, excludeId: string): Promise<{ id: string } | null> {
    const row = await this.db("devices").where("client_id", clientId)
      .whereRaw("upper(btrim(serial_number)) = upper(?)", [serial]).whereNot("id", excludeId).whereNull("merged_into").first();
    return row ? { id: row.id } : null;
  }

  async findSerialCollisions(clientId: string, serialsUpper: string[], excludeIds: string[]): Promise<Map<string, string>> {
    const rows: Array<{ id: string; serial_number: string | null }> = await this.db("devices")
      .where("client_id", clientId).whereNull("merged_into").whereNotIn("id", excludeIds)
      .whereRaw("upper(btrim(serial_number)) = ANY(?)", [serialsUpper]).select("id", "serial_number");
    return new Map(rows.filter((r) => r.serial_number).map((r) => [String(r.serial_number).toUpperCase(), r.id]));
  }

  async setMonitorState(id: string, state: string, by: string | null, reason: string | null): Promise<DeviceRow> {
    const [row] = await this.db("devices").where({ id }).update({
      monitor_state: state, monitor_state_changed_at: new Date(), monitor_state_changed_by: by, monitor_state_reason: reason,
    }).returning("*");
    return row;
  }
}
