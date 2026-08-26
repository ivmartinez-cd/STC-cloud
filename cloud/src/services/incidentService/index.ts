/**
 * Fase 11 del gap analysis vs HP SDS — servicio de incidentes. `incident_events`
 * es el audit trail PROPIO del incidente (kind/body/metadata/user/fecha) — no
 * se duplica en `audit_logs` genérico, que ya tiene su propio feed de
 * "Movimientos y cambios" para acciones de dispositivos/clientes/usuarios.
 */
import { classOfAlert } from "../incidentClassifier";

export { IncidentError } from "./errors";
export type { ListIncidentsParams } from "./reads";
export { listIncidents, getIncidentStats, getIncident } from "./reads";
export type { CreateIncidentParams } from "./mutations";
export {
  createIncident,
  updateIncident,
  setStatus,
  closeIncident,
  reopenIncident,
  addComment,
  assignIncident,
  linkAlert,
  unlinkAlert,
} from "./mutations";
export { listIncidentRules, upsertIncidentRule } from "./rules";
export { classOfAlert };
