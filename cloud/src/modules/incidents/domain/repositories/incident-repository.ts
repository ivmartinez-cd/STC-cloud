import type { IncidentStatus } from "../entities/incident-status";

/** Interfaces deliberadamente laxas (`any`/`Record<string, unknown>`) — mismo
 * nivel de tipado que tenía el `incidentService` original; no se introduce
 * precisión nueva en esta migración, sólo se reorganiza en capas. */

export interface ListIncidentsParams {
  clientId?: string | null;
  status?: string | null;
  klass?: string | null;
  severity?: string | null;
  deviceId?: string | null;
  assignedTo?: string | null;
  q?: string | null;
  noDevice?: boolean;
  minAgeHours?: number | null;
  limit?: number;
  offset?: number;
  order?: "opened_at_desc" | "opened_at_asc" | "aging_desc";
}

export interface CreateIncidentParams {
  clientId: string;
  deviceId?: string | null;
  klass: string;
  title?: string | null;
  description?: string | null;
  severity?: "warning" | "critical";
  externalId?: string | null;
  alertIds?: number[];
  actorId?: string | null;
}

export type IncidentRulePatch = {
  enabled?: boolean; min_severity?: string; delay_minutes?: number;
  sla_hours?: number | null; auto_close_on_alerts_resolved?: boolean;
};

export interface IncidentRepository {
  listIncidents(params: ListIncidentsParams): Promise<{ items: any[]; total: number }>;
  getIncidentStats(params: { clientId?: string | null }): Promise<Record<string, unknown>>;
  getIncident(id: string): Promise<any | null>;

  createIncident(params: CreateIncidentParams): Promise<any>;
  updateIncident(id: string, patch: Record<string, unknown>, actorId?: string | null): Promise<any | null>;
  setStatus(id: string, status: IncidentStatus, actorId?: string | null): Promise<any | null>;
  closeIncident(id: string, params: { reason?: string | null; actorId?: string | null }): Promise<any | null>;
  reopenIncident(id: string, params: { reason?: string | null; actorId?: string | null }): Promise<any | null>;
  addComment(id: string, params: { body: string; actorId?: string | null }): Promise<void | null>;
  assignIncident(id: string, params: { userId: string | null; actorId?: string | null }): Promise<any | null>;
  linkAlert(id: string, alertId: number, actorId?: string | null): Promise<boolean>;
  unlinkAlert(id: string, alertId: number, actorId?: string | null): Promise<boolean>;

  listIncidentRules(clientId: string): Promise<any[]>;
  upsertIncidentRule(clientId: string, klass: string, patch: IncidentRulePatch): Promise<any>;
  listGlobalIncidentRules(): Promise<any[]>;
  upsertGlobalIncidentRule(klass: string, patch: IncidentRulePatch): Promise<any>;
}
