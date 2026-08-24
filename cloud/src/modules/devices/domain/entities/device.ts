/**
 * Read models y tipos del dominio `devices`. `devices` es la tabla más ancha
 * del sistema y otros módulos le agregan columnas (`custom_data`, overrides de
 * inventario, `monitor_state`, `registration_state`, ...): las filas se
 * modelan en snake_case con las columnas que este módulo LEE explícitamente
 * + un index signature, y el wire las devuelve tal cual — mismo criterio que
 * `ClientRecord`/`PeriodUsageLine`.
 */

export type DeviceScope = { kind: "all" } | { kind: "client"; id: string };

export type MonitorState = "full" | "supplies_only" | "reports_only" | "disabled";
export type RegistrationState = "pending" | "registered" | "ignored";

export interface DeviceRow {
  id: string;
  client_id: string | null;
  agent_id: string | null;
  serial_number: string | null;
  mac: string | null;
  ip_address: string | null;
  hostname: string | null;
  location_reported: string | null;
  firmware: string | null;
  sku: string | null;
  brand: string | null;
  model: string | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  last_seen: Date | null;
  created_at: Date;
  merged_into: string | null;
  decommissioned_at: Date | null;
  monitor_state: MonitorState | string;
  registration_state: RegistrationState | string;
  agent_reassigned_at: Date | null;
  custom_data: unknown;
  [column: string]: unknown;
}

export interface AgentRow {
  id: string;
  client_id: string;
  status: string;
  [column: string]: unknown;
}

export interface PendingDeviceRow {
  id: string;
  ip_address: string | null;
  mac: string | null;
  serial_number: string | null;
  hostname: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  agent_id: string | null;
  agent_name: string | null;
  created_at: string;
  last_seen: string | null;
}

export interface StaleDeviceRow {
  id: string;
  serial_number: string | null;
  model: string | null;
  ip_address: string | null;
  last_seen: Date | null;
  client_id: string | null;
}

/** Resultado común de las acciones en bloque (Fase 9): applied/skipped clasificados. */
export type BulkSkipReason =
  | "not_found" | "merged" | "already_decommissioned" | "not_decommissioned"
  | "same_agent" | "collision" | "confirm_required";

export interface BulkSkip {
  id: string;
  reason: BulkSkipReason;
}

export interface BulkResult {
  count: number;
  applied: string[];
  skipped: BulkSkip[];
}

export interface MergeParams {
  targetId: string;
  sourceId: string;
  reason: "ghost_ip" | "ghost_serial_promote" | "dedupe" | "manual";
  actor: "portal" | "ingest";
  userId?: string | null;
  ip?: string | null;
  requestReason?: string | null;
  onOverlap?: "abort" | "keep_target" | "keep_source";
  force?: boolean;
  maxReadings?: number;
}

export interface MergeResult {
  keptId: string;
  mergedId: string;
  readingsMoved: number;
  readingsDeletedOverlap: number;
  alertsMoved: number;
  alertsResolvedCollision: number;
  closureLinesMoved: number;
}

export interface ResolveIdentityParams {
  clientId: string;
  agentId: string;
  serial: string | null;
  mac: string | null;
  ip: string | null;
}

export interface ResolvedDevice {
  id: string;
  agent_id: string;
  client_id: string;
  serial_number: string | null;
  mac: string | null;
  ip_address: string | null;
  decommissioned_at: Date | null;
  last_seen: Date | null;
  agent_reassigned_at: Date | null;
  [key: string]: unknown;
}

export type MatchedBy = "serial" | "mac" | "ip" | "none";
