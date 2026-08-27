export const INCIDENT_STATUSES = ["open", "in_progress", "on_hold", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
