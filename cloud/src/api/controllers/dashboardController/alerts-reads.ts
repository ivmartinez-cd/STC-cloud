import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getScope } from "../../utils/scope";
import { ALERT_CLASS_LABELS, RESPONDER_LABELS, type AlertClass } from "../../../services/alertCatalog";
import { ALERT_CLASS_IDS, RESPONDER_IDS, buildScopedAlertQuery, parseCsvOrThrow } from "./shared";

async function getAlerts(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { resolved, device_id, client_id, severity, type, alert_class, responder, acknowledged, limit, offset } =
    request.query as {
      resolved?: string; device_id?: string; client_id?: string; severity?: string; type?: string;
      alert_class?: string; responder?: string; acknowledged?: string; limit?: string; offset?: string;
    };
  const scope = getScope(request);
  const pageLimit = Math.min(Number(limit) || 200, 200);
  const pageOffset = Math.max(Number(offset) || 0, 0);

  let alertClasses: string[] | undefined;
  let responders: string[] | undefined;
  try {
    alertClasses = parseCsvOrThrow(alert_class, ALERT_CLASS_IDS, "alert_class");
    responders = parseCsvOrThrow(responder, RESPONDER_IDS, "responder");
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 400;
    return reply.status(statusCode).send({ error: (err as Error).message });
  }

  const query = buildScopedAlertQuery(db, scope, {
    deviceId: device_id, clientId: client_id, severity, type, alertClasses, responders, resolved, acknowledged,
  })
    .select(
      "alerts.id",
      "alerts.device_id",
      "alerts.agent_id",
      "alerts.type",
      "alerts.severity",
      "alerts.message",
      "alerts.value",
      "alerts.resolved",
      "alerts.resolved_at",
      "alerts.acknowledged",
      "alerts.ack_at",
      "alerts.created_at",
      "alerts.alert_class",
      "alerts.alert_reason",
      "alerts.responder",
      "alerts.origin",
      "devices.brand",
      "devices.ip_address",
      "devices.name as device_name",
      "devices.serial_number as serial",
      "agents.name as agent_name",
      "clients.id as client_id",
      "clients.name as client_name",
      // Fase 11 del gap analysis vs HP SDS — subquery en vez de JOIN a
      // `incident_alerts`: un JOIN duplicaría la fila de alerta si algún
      // día queda vinculada a más de un incidente (raro, pero el índice
      // no lo impide). La más reciente gana.
      db.raw(`(SELECT ia.incident_id FROM incident_alerts ia WHERE ia.alert_id = alerts.id ORDER BY ia.linked_at DESC LIMIT 1) as incident_id`),
      db.raw(`(SELECT i.number FROM incident_alerts ia JOIN incidents i ON i.id = ia.incident_id WHERE ia.alert_id = alerts.id ORDER BY ia.linked_at DESC LIMIT 1) as incident_number`)
    )
    .orderBy("alerts.created_at", "desc")
    .limit(pageLimit)
    .offset(pageOffset);

  return await query;
}

/** Catálogo estático de clases/responders — alimenta el filtro de `Alerts.tsx`. */
async function getAlertClasses() {
  return {
    classes: Object.entries(ALERT_CLASS_LABELS).map(([id, label]) => ({ id, label })),
    responders: Object.entries(RESPONDER_LABELS).map(([id, label]) => ({ id, label })),
  };
}

async function getAlertSummary(db: Knex, request: FastifyRequest) {
  const { resolved, client_id } = request.query as { resolved?: string; client_id?: string };
  const scope = getScope(request);

  const byClassRows: Array<{ alert_class: AlertClass | null; count: string }> = await buildScopedAlertQuery(
    db, scope, { clientId: client_id, resolved: resolved ?? "false" }
  )
    .select("alerts.alert_class")
    .count("alerts.id as count")
    .groupBy("alerts.alert_class");

  const bySeverityRows: Array<{ severity: string; count: string }> = await buildScopedAlertQuery(
    db, scope, { clientId: client_id, resolved: resolved ?? "false" }
  )
    .select("alerts.severity")
    .count("alerts.id as count")
    .groupBy("alerts.severity");

  const byClass = byClassRows
    .filter((r) => r.alert_class)
    .map((r) => ({
      alert_class: r.alert_class as AlertClass,
      label: ALERT_CLASS_LABELS[r.alert_class as AlertClass] ?? r.alert_class,
      count: Number(r.count),
    }))
    .sort((a, b) => b.count - a.count);

  const bySeverity = { critical: 0, warning: 0 };
  for (const r of bySeverityRows) {
    if (r.severity === "critical" || r.severity === "warning") bySeverity[r.severity] = Number(r.count);
  }

  return { byClass, bySeverity, total: bySeverity.critical + bySeverity.warning };
}

export function createDashboardAlertReadHandlers(db: Knex) {
  return {
    getAlerts: (request: FastifyRequest, reply: FastifyReply) => getAlerts(db, request, reply),
    getAlertClasses: () => getAlertClasses(),
    getAlertSummary: (request: FastifyRequest) => getAlertSummary(db, request),
  };
}
