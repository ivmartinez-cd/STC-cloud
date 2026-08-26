import type { Alert } from './alerts';

/**
 * Fase 11 del gap analysis vs HP SDS — módulo de incidentes. Ver
 * `cloud/src/services/incidentService.ts` — única fuente de verdad del cálculo
 * de `aging_seconds` (nunca se guarda una columna, se calcula siempre al leer).
 */
export type IncidentStatus = 'open' | 'in_progress' | 'on_hold' | 'closed';
export type IncidentSeverity = 'warning' | 'critical';
export type IncidentOrigin = 'auto' | 'manual';

export type Incident = {
  id: string;
  number: number | string;
  external_id: string | null;
  client_id: string;
  client_name?: string | null;
  device_id: string | null;
  agent_id: string | null;
  agent_name?: string | null;
  device_serial: string | null;
  device_label: string | null;
  class: string;
  rule_id: string | null;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  origin: IncidentOrigin;
  opened_at: string;
  first_response_at: string | null;
  sla_due_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  reopened_count: number;
  assigned_to: string | null;
  assigned_to_username?: string | null;
  created_by: string | null;
  created_by_username?: string | null;
  updated_at: string;
  aging_seconds: number | string;
};

export type IncidentEvent = {
  id: string;
  incident_id: string;
  kind: 'comment' | 'status_change' | 'assign' | 'link_alert' | 'unlink_alert' | 'external_id' | 'reopen' | 'sla_breached';
  body: string | null;
  metadata: unknown;
  user_id: string | null;
  user_username?: string | null;
  created_at: string;
};

export type IncidentDetail = Incident & { alerts: Alert[]; events: IncidentEvent[] };

export type IncidentListResponse = { items: Incident[]; total: number };

export type IncidentClassAging = { class: string; count: number; avgAgingSeconds: number };
export type IncidentInstantClosure = { class: string; count: number; ruleId: string | null; sampleClientId: string };

export type IncidentStats = {
  byStatus: Record<IncidentStatus, number>;
  openTotal: number;
  byClass: IncidentClassAging[];
  avgAgingSeconds: number;
  maxAgingSeconds: number;
  instantClosures: IncidentInstantClosure[];
  unassignedOpenCount: number;
  recentClosedCount: number;
  byOrigin: { manual: number; auto: number };
};

export type IncidentRule = {
  id: string;
  client_id: string | null;
  class: string;
  enabled: boolean;
  min_severity: IncidentSeverity;
  delay_minutes: number;
  sla_hours: number | null;
  auto_close_on_alerts_resolved: boolean;
  updated_at: string;
};
