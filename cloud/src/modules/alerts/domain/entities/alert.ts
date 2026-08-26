/**
 * Entidades del dominio `alerts`. Las clases/responders son la taxonomía
 * estilo HP SDS Manager (Fase 1 del gap analysis) — el portal NUNCA duplica
 * este mapa: consume `alert_class`/`alert_reason`/`responder` ya resueltos y la
 * lista de clases vía `GET /api/v1/alerts/classes`.
 */

export type AlertClass =
  | "consumable_out"
  | "consumable_low"
  | "system_failure"
  | "system_warning"
  | "user_action"
  | "system_change"
  | "jam"
  | "media_out"
  | "media_low"
  | "information"
  | "subunit_low"
  | "subunit_out"
  | "availability"
  | "other";

export type Responder = "none" | "untrained" | "trained" | "field_service" | "management";

export type AlertSeverity = "warning" | "critical";

/**
 * `'cloud'`: la abrimos nosotros mismos (toner_*, counter_reset, device_offline,
 * agent_offline, device_still_reporting). `'device'`: viene tal cual del equipo
 * (EWS/SNMP crudo). Ver migración `20260824010000_alerts_classification_and_origin.ts`.
 */
export type AlertOrigin = "cloud" | "device";

export const ALERT_CLASS_LABELS: Record<AlertClass, string> = {
  consumable_out: "Consumible agotado",
  consumable_low: "Nivel bajo del consumible",
  system_failure: "Fallo del sistema",
  system_warning: "Advertencia del sistema",
  user_action: "Acción del usuario",
  system_change: "Cambio del sistema",
  jam: "Atasco",
  media_out: "Soporte fuera",
  media_low: "Soporte bajo",
  information: "Información",
  subunit_low: "Subunidad baja",
  subunit_out: "Subunidad fuera",
  availability: "Disponibilidad",
  other: "Otro",
};

export const RESPONDER_LABELS: Record<Responder, string> = {
  none: "Sin intervención",
  untrained: "Sin formación",
  trained: "Con formación",
  field_service: "Servicio de campo",
  management: "Gestión",
};

export const ALERT_CLASS_IDS: ReadonlySet<string> = new Set(Object.keys(ALERT_CLASS_LABELS));
export const RESPONDER_IDS: ReadonlySet<string> = new Set(Object.keys(RESPONDER_LABELS));

export interface AlertClassification {
  reason: string;
  klass: AlertClass;
  responder: Responder;
}

/** Fila del listado `GET /alerts` — alerta + contexto del equipo/agente/cliente. */
export interface AlertListItem {
  id: number;
  deviceId: string | null;
  agentId: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number | null;
  resolved: boolean;
  resolvedAt: Date | null;
  acknowledged: boolean;
  ackAt: Date | null;
  createdAt: Date;
  alertClass: AlertClass | null;
  alertReason: string | null;
  responder: Responder | null;
  origin: AlertOrigin;
  brand: string | null;
  ipAddress: string | null;
  deviceName: string | null;
  serial: string | null;
  agentName: string | null;
  clientId: string | null;
  clientName: string | null;
  incidentId: string | null;
  incidentNumber: number | null;
}

/** Lo que devuelve `PUT /alerts/:id` — sólo el estado de ciclo de vida. */
export interface AlertLifecycleState {
  id: number;
  acknowledged: boolean;
  ackBy: string | null;
  ackAt: Date | null;
  resolved: boolean;
  resolvedAt: Date | null;
}

export interface AlertClassCount {
  alertClass: AlertClass;
  label: string;
  count: number;
}

/**
 * "Sin resolver por código" (handoff hifi #3, 26/08/2026) — agregado más fino
 * que `byClass`: dentro de la clase `availability`, `device_offline` y
 * `agent_offline` son problemas distintos (equipo vs. agente) pero hoy
 * `alert_class` los fusiona. `code` es el `type` crudo para `availability`
 * (única clase con más de un `type` relevante) y el nombre de la clase para
 * el resto — ver `DIAGNOSTIC_CODE_LABELS` y `KnexAlertRepository.countByCode`.
 */
export interface AlertCodeCount {
  code: string;
  label: string;
  count: number;
}

/** Etiquetas de los códigos de diagnóstico más frecuentes — el resto cae a
 * `ALERT_CLASS_LABELS[code]` (el código ES el nombre de la clase en ese caso). */
export const DIAGNOSTIC_CODE_LABELS: Record<string, string> = {
  device_offline: "Equipo sin señal",
  agent_offline: "Agente sin señal",
  counter_reset: "Reinicio de contador",
  consumable_low: "Consumible bajo",
};

export interface AlertSummary {
  byClass: AlertClassCount[];
  byCode: AlertCodeCount[];
  bySeverity: { critical: number; warning: number };
  total: number;
  /** Clientes distintos con al menos una alerta que matchea el filtro actual. */
  clientsAffected: number;
}
