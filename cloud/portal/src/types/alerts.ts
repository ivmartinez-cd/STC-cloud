/**
 * Forma unificada de una alerta tal como la devuelve `GET /api/v1/alerts`
 * (`dashboardController.getAlerts`). Reemplaza 3 tipos `Alert` que habían quedado
 * divergentes en `Dashboard.tsx`/`DeviceDetail.tsx` — uno de ellos (`DeviceDetail`)
 * leía campos (`timestamp`, `deviceId`) que la API nunca manda (`created_at`,
 * `device_id`), así que esa columna nunca renderizaba nada.
 */
export type AlertSeverity = 'warning' | 'critical';

/** Ver `ALERT_CLASS_LABELS`/`RESPONDER_LABELS` en `cloud/src/services/alertCatalog.ts` — la única fuente de verdad de estos ids es el backend, vía `GET /alerts/classes`. */
export type AlertClass =
  | 'consumable_out' | 'consumable_low' | 'system_failure' | 'system_warning' | 'user_action'
  | 'system_change' | 'jam' | 'media_out' | 'media_low' | 'information' | 'subunit_low'
  | 'subunit_out' | 'availability' | 'other';

export type Responder = 'none' | 'untrained' | 'trained' | 'field_service' | 'management';

export type Alert = {
  /** `alerts.id` es un `serial` (entero), no un uuid — a diferencia de casi todo el resto del modelo. */
  id: number;
  device_id: string | null;
  agent_id: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number | null;
  resolved: boolean;
  resolved_at: string | null;
  acknowledged: boolean;
  ack_at: string | null;
  created_at: string;
  /**
   * Clasificación (Fase 1 del gap analysis vs HP SDS, migración
   * `20260824010000_alerts_classification_and_origin.ts`). Opcionales: filas
   * insertadas antes de esa migración en un deploy rodante podrían no tenerlas
   * todavía en el instante exacto del rollout.
   */
  alert_class?: AlertClass | null;
  alert_reason?: string | null;
  responder?: Responder | null;
  origin?: 'cloud' | 'device' | null;
  /** Ausentes en una alerta agent-scoped (p.ej. `agent_offline`, sin dispositivo puntual). */
  brand?: string | null;
  ip_address?: string | null;
  device_name?: string | null;
  serial?: string | null;
  agent_name?: string | null;
  client_name?: string | null;
  client_id?: string | null;
  /** Fase 11 del gap analysis vs HP SDS — vínculo con `incidents`, si lo tiene. */
  incident_id?: string | null;
  incident_number?: number | string | null;
};

export type AlertClassOption = { id: AlertClass; label: string };
export type ResponderOption = { id: Responder; label: string };

export type AlertClassesResponse = {
  classes: AlertClassOption[];
  responders: ResponderOption[];
};

export type AlertSummary = {
  byClass: Array<{ alert_class: AlertClass; label: string; count: number }>;
  bySeverity: { critical: number; warning: number };
  total: number;
};
