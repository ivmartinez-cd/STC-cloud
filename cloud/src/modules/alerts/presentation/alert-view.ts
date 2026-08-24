import {
  ALERT_CLASS_LABELS, RESPONDER_LABELS, type AlertLifecycleState, type AlertListItem, type AlertSummary,
} from "../domain/entities/alert";

// Contrato de wire snake_case preservado tal cual lo consumía ya el portal
// (`types/alerts.ts`) — el dominio interno usa camelCase, esta es la
// traducción explícita en el borde del sistema.

export function toAlertListView(items: AlertListItem[]) {
  return items.map((a) => ({
    id: a.id,
    device_id: a.deviceId,
    agent_id: a.agentId,
    type: a.type,
    severity: a.severity,
    message: a.message,
    value: a.value,
    resolved: a.resolved,
    resolved_at: a.resolvedAt,
    acknowledged: a.acknowledged,
    ack_at: a.ackAt,
    created_at: a.createdAt,
    alert_class: a.alertClass,
    alert_reason: a.alertReason,
    responder: a.responder,
    origin: a.origin,
    brand: a.brand,
    ip_address: a.ipAddress,
    device_name: a.deviceName,
    serial: a.serial,
    agent_name: a.agentName,
    client_id: a.clientId,
    client_name: a.clientName,
    incident_id: a.incidentId,
    incident_number: a.incidentNumber,
  }));
}

/** Catálogo estático de clases/responders — alimenta el filtro de `Alerts.tsx`. */
export function toAlertClassesView() {
  return {
    classes: Object.entries(ALERT_CLASS_LABELS).map(([id, label]) => ({ id, label })),
    responders: Object.entries(RESPONDER_LABELS).map(([id, label]) => ({ id, label })),
  };
}

export function toAlertSummaryView(s: AlertSummary) {
  return {
    byClass: s.byClass.map((c) => ({ alert_class: c.alertClass, label: c.label, count: c.count })),
    bySeverity: s.bySeverity,
    total: s.total,
  };
}

export function toAlertLifecycleView(a: AlertLifecycleState) {
  return { id: a.id, acknowledged: a.acknowledged, ack_by: a.ackBy, ack_at: a.ackAt, resolved: a.resolved, resolved_at: a.resolvedAt };
}
