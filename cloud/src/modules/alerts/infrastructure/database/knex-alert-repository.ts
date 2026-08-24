import type { Knex } from "knex";
import type { AlertClass, AlertLifecycleState } from "../../domain/entities/alert";
import type {
  AlertPage, AlertQueryFilters, AlertRepository, AlertScope, AlertTarget, NewAlert, RawAlertListRow,
} from "../../domain/repositories/alert-repository";
import type { AlertLifecycleUpdates, DeviceAlertGate } from "../../domain/services/alert-rules";

const LIST_COLUMNS = [
  "alerts.id", "alerts.device_id", "alerts.agent_id", "alerts.type", "alerts.severity", "alerts.message",
  "alerts.value", "alerts.resolved", "alerts.resolved_at", "alerts.acknowledged", "alerts.ack_at",
  "alerts.created_at", "alerts.alert_class", "alerts.alert_reason", "alerts.responder", "alerts.origin",
  "devices.brand", "devices.ip_address", "devices.name as device_name", "devices.serial_number as serial",
  "agents.name as agent_name", "clients.id as client_id", "clients.name as client_name",
];

// Fase 11 del gap analysis vs HP SDS — subquery en vez de JOIN a `incident_alerts`:
// un JOIN duplicaría la fila de alerta si algún día queda vinculada a más de un
// incidente (raro, pero el índice no lo impide). La más reciente gana.
const INCIDENT_ID_SQL =
  "(SELECT ia.incident_id FROM incident_alerts ia WHERE ia.alert_id = alerts.id ORDER BY ia.linked_at DESC LIMIT 1) as incident_id";
const INCIDENT_NUMBER_SQL =
  "(SELECT i.number FROM incident_alerts ia JOIN incidents i ON i.id = ia.incident_id WHERE ia.alert_id = alerts.id ORDER BY ia.linked_at DESC LIMIT 1) as incident_number";

/** Scoping por cliente: equipo del cliente, o alerta agent-scoped (sin device) de un agente del cliente. */
function whereClientOwns(q: Knex.QueryBuilder, clientId: string) {
  q.andWhere((b) => {
    b.where("devices.client_id", clientId).orWhere((b2) => {
      b2.whereNull("devices.id").andWhere("agents.client_id", clientId);
    });
  });
}

function applyFilters(query: Knex.QueryBuilder, f: AlertQueryFilters) {
  if (f.deviceId) query.where("alerts.device_id", f.deviceId);
  if (f.clientId) whereClientOwns(query, f.clientId);
  if (f.severity) query.where("alerts.severity", f.severity);
  if (f.type) query.where("alerts.type", f.type);
  if (f.alertClasses?.length) query.whereIn("alerts.alert_class", f.alertClasses);
  if (f.responders?.length) query.whereIn("alerts.responder", f.responders);
  if (f.resolved === "true") query.where("alerts.resolved", true);
  else if (f.resolved === "false") query.where("alerts.resolved", false);
  if (f.acknowledged === "true") query.where("alerts.acknowledged", true);
  else if (f.acknowledged === "false") query.where("alerts.acknowledged", false);
}

function toLifecycleUpdateRow(u: AlertLifecycleUpdates): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (u.acknowledged !== undefined) { row.acknowledged = u.acknowledged; row.ack_by = u.ackBy ?? null; row.ack_at = u.ackAt ?? null; }
  if (u.resolved !== undefined) { row.resolved = u.resolved; row.resolved_at = u.resolvedAt ?? null; }
  return row;
}

export class KnexAlertRepository implements AlertRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  /**
   * LEFT JOIN triple + scoping por cliente, factorizado para que listado,
   * resumen y el desglose del dashboard no reimplementen sus tres sutilezas:
   * (a) LEFT JOIN — no inner — porque una alerta agent-scoped (`agent_offline`)
   * no tiene `device_id`; (b) `agents` se resuelve por
   * `COALESCE(devices.agent_id, alerts.agent_id)` para cubrir ambos casos con un
   * solo join; (c) excluye lápidas de fusión (`devices.merged_into`) pero NO
   * bajas (`decommissioned_at` sigue apareciendo — su historial de alertas sigue
   * siendo válido).
   */
  private scopedQuery(scope: AlertScope, filters: AlertQueryFilters): Knex.QueryBuilder {
    const query = this.db("alerts")
      .leftJoin("devices", "alerts.device_id", "devices.id")
      .leftJoin("agents", "agents.id", this.db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
      .leftJoin("clients", "agents.client_id", "clients.id")
      .andWhere((b) => { b.whereNull("devices.id").orWhereNull("devices.merged_into"); });
    if (scope.kind === "client") whereClientOwns(query, scope.id);
    applyFilters(query, filters);
    return query;
  }

  /** Mismo join/scope que `scopedQuery` pero SIN excluir lápidas — así lo hacía el controller de mutaciones. */
  private ownershipQuery(scope: AlertScope): Knex.QueryBuilder {
    const query = this.db("alerts")
      .leftJoin("devices", "alerts.device_id", "devices.id")
      .leftJoin("agents", "agents.id", this.db.raw("COALESCE(devices.agent_id, alerts.agent_id)"));
    if (scope.kind === "client") whereClientOwns(query, scope.id);
    return query;
  }

  async findDeviceGate(deviceId: string): Promise<DeviceAlertGate | null> {
    const row = await this.db("devices").where({ id: deviceId }).select("monitor_state", "registration_state").first();
    return row ? { monitorState: row.monitor_state, registrationState: row.registration_state } : null;
  }

  /**
   * El conflict target se pasa como `db.raw(...)` porque apunta a un índice
   * PARCIAL — la forma de array de knex (`.onConflict(["a","b"])`) sólo puede
   * expresar un índice total, no el `WHERE resolved = false`.
   */
  async insertIfNotOpen(alert: NewAlert): Promise<number | null> {
    const conflictTarget = alert.deviceId
      ? this.db.raw("(device_id, type) WHERE resolved = false AND device_id IS NOT NULL")
      : this.db.raw("(agent_id, type) WHERE resolved = false AND agent_id IS NOT NULL");
    const rows = await this.db("alerts")
      .insert({
        device_id: alert.deviceId ?? null, agent_id: alert.agentId ?? null, type: alert.type,
        severity: alert.severity, message: alert.message, value: alert.value, resolved: false,
        alert_class: alert.classification.klass, alert_reason: alert.classification.reason,
        responder: alert.classification.responder, origin: alert.origin,
      })
      .onConflict(conflictTarget)
      .ignore()
      .returning("id");
    return rows.length > 0 && rows[0]?.id !== undefined ? rows[0].id : null;
  }

  resolveOpen(target: AlertTarget, type: string): Promise<number> {
    return this.db("alerts")
      .where({ type, resolved: false })
      .modify((q) => {
        if (target.deviceId) q.andWhere("device_id", target.deviceId);
        else q.andWhere("agent_id", target.agentId as string);
      })
      .update({ resolved: true, resolved_at: new Date() });
  }

  resolveStaleDeviceAlerts(deviceId: string, currentTypes: string[]): Promise<number> {
    return this.db("alerts")
      .where({ device_id: deviceId, resolved: false, origin: "device" })
      .whereNotIn("type", currentTypes)
      .update({ resolved: true, resolved_at: new Date() });
  }

  findPage(scope: AlertScope, filters: AlertQueryFilters, page: AlertPage): Promise<RawAlertListRow[]> {
    return this.scopedQuery(scope, filters)
      .select(...LIST_COLUMNS, this.db.raw(INCIDENT_ID_SQL), this.db.raw(INCIDENT_NUMBER_SQL))
      .orderBy("alerts.created_at", "desc")
      .limit(page.limit)
      .offset(page.offset);
  }

  async countByClass(scope: AlertScope, filters: AlertQueryFilters) {
    const rows: Array<{ alert_class: AlertClass | null; count: string }> = await this.scopedQuery(scope, filters)
      .select("alerts.alert_class").count("alerts.id as count").groupBy("alerts.alert_class");
    return rows.map((r) => ({ alertClass: r.alert_class, count: Number(r.count) }));
  }

  async countBySeverity(scope: AlertScope, filters: AlertQueryFilters) {
    const rows: Array<{ severity: string; count: string }> = await this.scopedQuery(scope, filters)
      .select("alerts.severity").count("alerts.id as count").groupBy("alerts.severity");
    return rows.map((r) => ({ severity: r.severity, count: Number(r.count) }));
  }

  async findOwnedIds(scope: AlertScope, ids: number[]): Promise<number[]> {
    const owned: Array<{ id: number }> = await this.ownershipQuery(scope).whereIn("alerts.id", ids).select("alerts.id");
    return owned.map((r) => r.id);
  }

  async updateOne(id: number, updates: AlertLifecycleUpdates): Promise<AlertLifecycleState> {
    const [row] = await this.db("alerts").where({ id }).update(toLifecycleUpdateRow(updates)).returning([
      "id", "acknowledged", "ack_by", "ack_at", "resolved", "resolved_at",
    ]);
    return { id: row.id, acknowledged: row.acknowledged, ackBy: row.ack_by, ackAt: row.ack_at, resolved: row.resolved, resolvedAt: row.resolved_at };
  }

  async updateMany(ids: number[], updates: AlertLifecycleUpdates): Promise<void> {
    await this.db("alerts").whereIn("id", ids).update(toLifecycleUpdateRow(updates));
  }
}
