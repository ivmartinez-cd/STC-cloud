import type { AlertOrigin, AlertSeverity } from "../../domain/entities/alert";
import type { AlertScope } from "../../domain/repositories/alert-repository";

export interface OpenAlertInput {
  /** Exactamente uno de deviceId/agentId debe venir seteado (ver CHECK de la migración). */
  deviceId?: string | null;
  agentId?: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  value?: number | null;
  /** Default `'cloud'` — ver `AlertOrigin`. */
  origin?: AlertOrigin;
}

export interface OpenAlertResult {
  /** `true` si se insertó una fila nueva; `false` si ya había una abierta (dedupe). */
  created: boolean;
  id?: number;
}

export interface ResolveAlertInput {
  deviceId?: string | null;
  agentId?: string | null;
  type: string;
}

export interface ResolveStaleDeviceAlertsInput {
  deviceId: string;
  /** Vacío resuelve todas las de origen dispositivo abiertas de ese equipo. */
  currentTypes: string[];
}

/** Query params crudos de `GET /alerts` — la validación/coerción es del caso de uso. */
export interface ListAlertsInput {
  scope: AlertScope;
  resolved?: string;
  deviceId?: string;
  clientId?: string;
  severity?: string;
  type?: string;
  alertClass?: string;
  responder?: string;
  acknowledged?: string;
  /** Chip `+24 H` — horas hacia atrás desde ahora; el use-case lo convierte a fecha de corte. */
  maxAgeHours?: string;
  /** Buscador — código, cliente o equipo. */
  q?: string;
  limit?: string;
  offset?: string;
}

export interface GetAlertSummaryInput {
  scope: AlertScope;
  clientId?: string;
  /** Default `"false"` (sólo activas) — semántica del endpoint original. */
  resolved?: string;
}

export interface UpdateAlertInput {
  scope: AlertScope;
  id: string;
  acknowledged?: boolean;
  resolved?: boolean;
  userId: string | null;
  ipAddress: string | null;
}

export interface BulkUpdateAlertsInput {
  scope: AlertScope;
  ids?: number[];
  acknowledged?: boolean;
  resolved?: boolean;
  userId: string | null;
  ipAddress: string | null;
}

export interface BulkUpdateAlertsResult {
  count: number;
  applied: number[];
  skipped: Array<{ id: number; reason: "not_found" }>;
}
