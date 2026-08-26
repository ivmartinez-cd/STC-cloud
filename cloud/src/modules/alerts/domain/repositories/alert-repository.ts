import type { AlertClass, AlertClassification, AlertLifecycleState, AlertOrigin, AlertSeverity } from "../entities/alert";
import type { AlertLifecycleUpdates, DeviceAlertGate } from "../services/alert-rules";

/**
 * Alcance de datos de la request — estructuralmente idéntico a
 * `api/utils/scope.ts::Scope` (unión discriminada a propósito, nunca
 * `string | null`), duplicado acá para que el dominio no importe de la capa
 * HTTP.
 */
export type AlertScope = { kind: "all" } | { kind: "client"; id: string };

/** Filtros del listado/resumen — valores crudos de query string ya validados. */
export interface AlertQueryFilters {
  deviceId?: string;
  clientId?: string;
  severity?: string;
  type?: string;
  alertClasses?: string[];
  responders?: string[];
  /** `"true"` | `"false"` | otro (sin filtro) — semántica exacta del query param original. */
  resolved?: string;
  acknowledged?: string;
  /** Chip de filtro `+24 H` (handoff hifi #3, 26/08/2026) — el use-case calcula el
   * corte a partir de `?max_age_hours=`; el repositorio sólo filtra por fecha. */
  createdAfter?: Date;
  /** Buscador (handoff hifi #3, 26/08/2026) — código, cliente o equipo. */
  q?: string;
}

export interface AlertPage {
  limit: number;
  offset: number;
}

/** Exactamente uno de deviceId/agentId debe venir seteado (ver CHECK de la migración). */
export interface AlertTarget {
  deviceId?: string | null;
  agentId?: string | null;
}

export interface NewAlert extends AlertTarget {
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number | null;
  origin: AlertOrigin;
  classification: AlertClassification;
}

/** Fila cruda del listado tal como sale del join triple — snake_case de la base. */
export interface RawAlertListRow {
  id: number;
  device_id: string | null;
  agent_id: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number | null;
  resolved: boolean;
  resolved_at: Date | null;
  acknowledged: boolean;
  ack_at: Date | null;
  created_at: Date;
  alert_class: AlertClass | null;
  alert_reason: string | null;
  responder: string | null;
  origin: AlertOrigin;
  brand: string | null;
  ip_address: string | null;
  device_name: string | null;
  serial: string | null;
  agent_name: string | null;
  client_id: string | null;
  client_name: string | null;
  incident_id: string | null;
  incident_number: number | null;
}

export interface AlertRepository {
  /** `null` si el equipo no existe (en ese caso la alerta se abre igual — comportamiento histórico). */
  findDeviceGate(deviceId: string): Promise<DeviceAlertGate | null>;
  /**
   * `INSERT ... ON CONFLICT DO NOTHING` contra los índices únicos parciales
   * `(device_id,type) WHERE resolved=false` / `(agent_id,type) WHERE resolved=false`.
   * Devuelve el id insertado, o `null` si ya había una abierta (dedupe).
   */
  insertIfNotOpen(alert: NewAlert): Promise<number | null>;
  /** Resuelve la alerta abierta `(device_id|agent_id, type)`; devuelve filas tocadas. */
  resolveOpen(target: AlertTarget, type: string): Promise<number>;
  /** Resuelve las de `origin='device'` abiertas del equipo cuyo type no está en `currentTypes`. */
  resolveStaleDeviceAlerts(deviceId: string, currentTypes: string[]): Promise<number>;
  findPage(scope: AlertScope, filters: AlertQueryFilters, page: AlertPage): Promise<RawAlertListRow[]>;
  /** Total real para la paginación (handoff hifi #3, 26/08/2026) — mismos filtros que
   * `findPage`, sin `limit`/`offset`. Antes `GET /alerts` paginaba "a ciegas". */
  countMatching(scope: AlertScope, filters: AlertQueryFilters): Promise<number>;
  countByClass(scope: AlertScope, filters: AlertQueryFilters): Promise<Array<{ alertClass: AlertClass | null; count: number }>>;
  countBySeverity(scope: AlertScope, filters: AlertQueryFilters): Promise<Array<{ severity: string; count: number }>>;
  /** Agrupado por `type` dentro de `availability`, por `alert_class` en el resto — ver `AlertCodeCount`. */
  countByCode(scope: AlertScope, filters: AlertQueryFilters): Promise<Array<{ code: string | null; count: number }>>;
  countDistinctClients(scope: AlertScope, filters: AlertQueryFilters): Promise<number>;
  /** De `ids`, los que existen Y pertenecen al scope (defensa en profundidad, además del RBAC por ruta). */
  findOwnedIds(scope: AlertScope, ids: number[]): Promise<number[]>;
  updateOne(id: number, updates: AlertLifecycleUpdates): Promise<AlertLifecycleState>;
  updateMany(ids: number[], updates: AlertLifecycleUpdates): Promise<void>;
}
