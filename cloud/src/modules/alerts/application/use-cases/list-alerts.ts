import { ALERT_CLASS_IDS, RESPONDER_IDS, type AlertListItem, type Responder } from "../../domain/entities/alert";
import type { AlertQueryFilters, AlertRepository, RawAlertListRow } from "../../domain/repositories/alert-repository";
import { parseCsvOrThrow } from "../../domain/services/alert-rules";
import type { ListAlertsInput } from "../dtos/alert-dtos";

const MAX_PAGE = 200;
const MAX_AGE_HOURS_CAP = 168; // 7 días — tope defensivo, el chip del handoff sólo ofrece 24h

/** `undefined` si no viene o es inválido — mismo criterio permisivo que `parseCsvOrThrow`
 * para el resto de filtros opcionales: un valor raro se ignora, no rompe el listado. */
function parseCreatedAfter(maxAgeHours: string | undefined): Date | undefined {
  const hours = Number(maxAgeHours);
  if (!Number.isFinite(hours) || hours <= 0) return undefined;
  return new Date(Date.now() - Math.min(hours, MAX_AGE_HOURS_CAP) * 3_600_000);
}

export function toAlertListItem(r: RawAlertListRow): AlertListItem {
  return {
    id: r.id, deviceId: r.device_id, agentId: r.agent_id, type: r.type, severity: r.severity,
    message: r.message, value: r.value, resolved: r.resolved, resolvedAt: r.resolved_at,
    acknowledged: r.acknowledged, ackAt: r.ack_at, createdAt: r.created_at,
    alertClass: r.alert_class, alertReason: r.alert_reason, responder: r.responder as Responder | null,
    origin: r.origin, brand: r.brand, ipAddress: r.ip_address, deviceName: r.device_name,
    serial: r.serial, agentName: r.agent_name, clientId: r.client_id, clientName: r.client_name,
    incidentId: r.incident_id, incidentNumber: r.incident_number,
  };
}

/** Filtros compartidos por `ListAlertsUseCase` y `CountAlertsUseCase` — mismo
 * parseo/validación para que "página actual" y "total" nunca miren datos distintos. */
export function toAlertFilters(input: ListAlertsInput): AlertQueryFilters {
  const alertClasses = parseCsvOrThrow(input.alertClass, ALERT_CLASS_IDS, "alert_class");
  const responders = parseCsvOrThrow(input.responder, RESPONDER_IDS, "responder");
  return {
    deviceId: input.deviceId, clientId: input.clientId, severity: input.severity, type: input.type,
    alertClasses, responders, resolved: input.resolved, acknowledged: input.acknowledged,
    createdAfter: parseCreatedAfter(input.maxAgeHours), q: input.q?.trim() || undefined,
  };
}

/** `GET /alerts` — filtro server-side (Fase 1 del gap analysis: nunca post-paginación). */
export class ListAlertsUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(input: ListAlertsInput): Promise<AlertListItem[]> {
    // Lanza `AlertFilterError` (400) ante una clase/responder desconocido.
    const filters = toAlertFilters(input);
    const page = {
      limit: Math.min(Number(input.limit) || MAX_PAGE, MAX_PAGE),
      offset: Math.max(Number(input.offset) || 0, 0),
    };
    const rows = await this.alerts.findPage(input.scope, filters, page);
    return rows.map(toAlertListItem);
  }
}
