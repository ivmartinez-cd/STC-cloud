import type { Knex } from "knex";
import type {
  AuditActionCount,
  AuditLogFilter,
  AuditLogRepository,
  RawAuditLogRow,
} from "../../domain/repositories/audit-log-repository";

/** `audit_logs.target_id` es varchar heterogéneo — sólo se intenta castear a uuid
 * cuando tiene forma de uuid (evita `invalid input syntax for type uuid` contra
 * filas con ids numéricos u otro formato, ej. comandos de agente). */
const UUID_RX = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export class KnexAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: Knex) {}

  private buildBaseQuery(filter: AuditLogFilter) {
    const db = this.db;
    const q = db("audit_logs as a")
      .leftJoin("devices as td", (j) => {
        j.on("td.id", "=", db.raw(`CASE WHEN a.target_id ~ '${UUID_RX}' THEN a.target_id::uuid END`));
      })
      .leftJoin("agents as ta", (j) => {
        j.on("ta.id", "=", db.raw(`CASE WHEN a.target_id ~ '${UUID_RX}' THEN a.target_id::uuid END`));
      })
      .leftJoin("clients as tc", (j) => {
        j.on("tc.id", "=", db.raw(`CASE WHEN a.target_id ~ '${UUID_RX}' THEN a.target_id::uuid END`));
      })
      .leftJoin("clients as c", "c.id", "a.client_id")
      .leftJoin("users as u", "u.id", "a.user_id");

    q.where("a.created_at", ">=", filter.fromDate);
    if (filter.toDate) q.andWhere("a.created_at", "<=", filter.toDate);
    if (filter.actionsFilter) q.whereIn("a.action", filter.actionsFilter);
    if (filter.categoryActionsFilter) q.whereIn("a.action", filter.categoryActionsFilter);
    if (filter.clientId) q.andWhere("a.client_id", filter.clientId);
    if (filter.targetId) q.andWhere("a.target_id", filter.targetId);
    if (filter.userId) q.andWhere("a.user_id", filter.userId);

    return q;
  }

  async findPage(filter: AuditLogFilter): Promise<{ rows: RawAuditLogRow[]; total: number }> {
    const db = this.db;
    const [rows, [{ count }]] = await Promise.all([
      this.buildBaseQuery(filter)
        .select(
          "a.id", "a.created_at", "a.action", "a.target_id", "a.client_id", "a.user_id", "a.ip_address", "a.metadata",
          "c.name as client_name",
          "u.username as user_username",
          db.raw(`
            CASE
              WHEN td.id IS NOT NULL THEN 'device'
              WHEN ta.id IS NOT NULL THEN 'agent'
              WHEN tc.id IS NOT NULL THEN 'client'
              ELSE NULL
            END as target_kind
          `),
          db.raw(`COALESCE(td.name, ta.name, tc.name) as target_label`)
        )
        .orderBy("a.created_at", "desc")
        .limit(filter.limit)
        .offset(filter.offset),
      this.buildBaseQuery(filter).count("a.id as count"),
    ]);

    const mapped: RawAuditLogRow[] = rows.map((r: any) => ({
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      targetId: r.target_id,
      targetKind: r.target_kind,
      targetLabel: r.target_label ?? null,
      clientId: r.client_id,
      clientName: r.client_name ?? null,
      userId: r.user_id,
      userUsername: r.user_username ?? null,
      ipAddress: r.ip_address,
      metadata: r.metadata,
    }));

    return { rows: mapped, total: Number(count) };
  }

  async countActionsSince(sinceDate: Date): Promise<AuditActionCount[]> {
    const rows: Array<{ action: string; count: string }> = await this.db("audit_logs")
      .where("created_at", ">=", sinceDate)
      .select("action")
      .count("id as count")
      .groupBy("action");

    return rows.map((r) => ({ action: r.action, count: Number(r.count) }));
  }
}
