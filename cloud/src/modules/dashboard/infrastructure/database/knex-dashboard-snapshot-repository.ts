import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";
import type { SnapshotRow } from "../../domain/entities/dashboard-snapshot";
import type { ClientSnapshot, DashboardSnapshotRepository } from "../../domain/repositories/dashboard-snapshot-repository";

/**
 * Lectura/escritura de `dashboard_snapshots` (ver el docblock de la migración
 * `20260916190000` para el porqué de la tabla).
 *
 * Las tres consultas de conteo agrupan por cliente en UNA pasada en vez de
 * iterar cliente por cliente: el job corre cada hora sobre toda la base y no
 * tiene por qué escalar con la cantidad de cuentas.
 */

/** Mismo criterio de propiedad que `whereClientOwns` en `modules/alerts`. */
const OPEN_ALERTS_BY_CLIENT_SQL = `
  SELECT
    COALESCE(d.client_id, g.client_id) AS client_id,
    COALESCE(a.alert_class, 'other')   AS alert_class,
    COUNT(*)::int                      AS count
  FROM alerts a
  LEFT JOIN devices d ON d.id = a.device_id
  LEFT JOIN agents  g ON g.id = COALESCE(d.agent_id, a.agent_id)
  WHERE a.resolved = false
    AND (d.id IS NULL OR d.merged_into IS NULL)
    AND COALESCE(d.client_id, g.client_id) IS NOT NULL
  GROUP BY 1, 2
`;

type ClassRow = { client_id: string; alert_class: string; count: number };

/** `jsonb` vuelve ya parseado desde el driver `pg`; el fallback cubre una fila
 * escrita como texto por un cliente SQL externo. */
function toSnapshotRow(r: Record<string, unknown>): SnapshotRow {
  return {
    at: r.at as Date,
    clientId: r.client_id as string,
    alertsByClass: typeof r.alerts_by_class === "string"
      ? JSON.parse(r.alerts_by_class)
      : (r.alerts_by_class as Record<string, number>),
    devicesTotal: r.devices_total as number | null,
    devicesManaged: r.devices_managed as number | null,
    agentsTotal: r.agents_total as number | null,
    agentsOnline: r.agents_online as number | null,
    suppliesCritical: r.supplies_critical as number | null,
    suppliesLow: r.supplies_low as number | null,
  };
}

export class KnexDashboardSnapshotRepository implements DashboardSnapshotRepository {
  constructor(private readonly db: Knex) {}

  async allClientIds(): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.db("clients").select("id");
    return rows.map((r) => r.id);
  }

  async openAlertsByClientAndClass(): Promise<Map<string, Record<string, number>>> {
    const { rows }: { rows: ClassRow[] } = await this.db.raw(OPEN_ALERTS_BY_CLIENT_SQL);
    const out = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const byClass = out.get(r.client_id) ?? {};
      byClass[r.alert_class] = Number(r.count);
      out.set(r.client_id, byClass);
    }
    return out;
  }

  async deviceCountsByClient(): Promise<Map<string, { total: number; managed: number }>> {
    const rows: Array<{ client_id: string; total: number; managed: number }> = await this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .select("client_id")
      .select(
        this.db.raw("COUNT(*)::int as total"),
        this.db.raw("COUNT(CASE WHEN monitor_state <> 'disabled' THEN 1 END)::int as managed")
      )
      .groupBy("client_id");
    return new Map(rows.map((r) => [r.client_id, { total: Number(r.total), managed: Number(r.managed) }]));
  }

  async agentCountsByClient(onlineSince: Date): Promise<Map<string, { total: number; online: number }>> {
    const rows: Array<{ client_id: string; total: number; online: number }> = await this.db("agents")
      .whereNot("status", "revoked")
      .select("client_id")
      .select(
        this.db.raw("COUNT(*)::int as total"),
        this.db.raw("COUNT(CASE WHEN last_seen >= ? THEN 1 END)::int as online", [onlineSince])
      )
      .groupBy("client_id");
    return new Map(rows.map((r) => [r.client_id, { total: Number(r.total), online: Number(r.online) }]));
  }

  async saveSnapshots(at: Date, rows: ClientSnapshot[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db("dashboard_snapshots")
      .insert(rows.map((r) => ({
        at,
        client_id: r.clientId,
        alerts_by_class: JSON.stringify(r.alertsByClass),
        devices_total: r.devicesTotal,
        devices_managed: r.devicesManaged,
        agents_total: r.agentsTotal,
        agents_online: r.agentsOnline,
        supplies_critical: r.suppliesCritical,
        supplies_low: r.suppliesLow,
      })))
      .onConflict(["client_id", "at"])
      .merge();
  }

  async snapshotsSince(since: Date, clientId: string | null): Promise<SnapshotRow[]> {
    const rows = await this.db("dashboard_snapshots")
      .where("at", ">=", since)
      .modify((q) => { if (clientId) q.where("client_id", clientId); })
      .orderBy("at", "asc")
      .select("*");
    return rows.map(toSnapshotRow);
  }
}
