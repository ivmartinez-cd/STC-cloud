import type { IpRangeSpecInput } from "../../../../shared/domain/ip-range-spec";
import type { BusinessHoursConfig } from "../../../../shared/domain/business-hours";

/**
 * Tipos del dominio `agents` (agentes DCA / monitores). Los payloads del
 * agente (`Incoming*`) y `MappedReading` son el contrato de wire de la
 * ingesta — se conservan tal cual estaban en `services/agentService/types.ts`.
 */

export type AgentScope = { kind: "all" } | { kind: "client"; id: string };

/** Interfaz mínima del cliente Redis utilizado para blacklists y colas. */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, duration: number): Promise<string | null>;
}

/** Contexto de auditoría opcional para trazar el operador e IP origen de una acción administrativa. */
export interface AuditContext {
  userId?: string;
  ip?: string;
}

/** Configuración de red y escaneo enviada desde el portal para actualizar un agente. */
export interface AgentConfigUpdate {
  ip_ranges?: IpRangeSpecInput[];
  snmp_community?: string;
  scan_interval_minutes?: number;
  name?: string;
  toner_warning_threshold?: number;
  toner_critical_threshold?: number;
  /** `null` = reset explícito al default hardcodeado; `undefined` = no tocar. */
  business_hours?: BusinessHoursConfig | null;
}

/** Dispositivo entrante desde el agente DCA durante el registro inicial. */
export interface IncomingDevice {
  ip: string;
  serial: string | null;
  mac?: string | null;
  brand: string;
  model: string;
  name: string;
}

/** Entrada de log remoto enviada por el agente DCA. */
export interface IncomingLogEntry {
  timestamp?: string;
  time?: string;
  level?: string;
  message: string;
}

/** Lectura de telemetría entrante desde el agente DCA durante la sincronización. */
export interface IncomingReading {
  reading_id?: string | null;
  device_id: string;
  ip?: string;
  brand?: string;
  model?: string;
  name?: string;
  time?: string;
  total_pages?: number | string | null;
  mono_pages?: number | string | null;
  color_pages?: number | string | null;
  toner_black?: number | string | null;
  toner_cyan?: number | string | null;
  toner_magenta?: number | string | null;
  toner_yellow?: number | string | null;
  cartridge_code_black?: string | null;
  cartridge_code_cyan?: string | null;
  cartridge_code_magenta?: string | null;
  cartridge_code_yellow?: string | null;
  cartridge_serial_black?: string | null;
  cartridge_serial_cyan?: string | null;
  cartridge_serial_magenta?: string | null;
  cartridge_serial_yellow?: string | null;
  cartridge_capacity_black?: number | string | null;
  cartridge_capacity_cyan?: number | string | null;
  cartridge_capacity_magenta?: number | string | null;
  cartridge_capacity_yellow?: number | string | null;
  cartridge_printed_black?: number | string | null;
  cartridge_printed_cyan?: number | string | null;
  cartridge_printed_magenta?: number | string | null;
  cartridge_printed_yellow?: number | string | null;
  cartridge_estimated_black?: number | string | null;
  cartridge_estimated_cyan?: number | string | null;
  cartridge_estimated_magenta?: number | string | null;
  cartridge_estimated_yellow?: number | string | null;
  supply_origin?: string | null;
  supplies_details?: any;
  firmware?: string | null;
  mac?: string | null;
  hostname?: string | null;
  location?: string | null;
  poll_method?: string;
  offline?: boolean;
}

/** Información de sistema enviada por el agente en cada heartbeat. */
export interface SystemInfoPayload {
  version?: string;
  host_name?: string;
  host_os?: string;
  host_ip?: string;
  uptime?: number;
}

/** Lectura procesada y mapeada lista para inserción en la tabla `readings`. */
export interface MappedReading {
  id?: string;
  reading_id?: string | null;
  time: Date;
  device_id: string;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
  supplies_details?: any;
  offline: boolean;
}

/** Fila de `agents` — tabla ancha, read model snake_case (mismo criterio que `DeviceRow`). */
export interface AgentRow {
  id: string;
  client_id: string | null;
  name: string;
  status: string;
  activation_key: string | null;
  activation_expires_at: Date | null;
  refresh_token_hash: string | null;
  last_seen: Date | null;
  [column: string]: unknown;
}

export interface AgentCommandRow {
  id: string;
  type: string;
  payload: unknown;
}

export interface InsertedReadingRow {
  device_id: string;
  time: Date;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
}
