import {
  compileIpRangeSpecs, extractHostSpecs, longLapWarnings, overlappingCredentialWarnings, publicIpWarnings,
  validateIpRangeSpecs,
  type CompiledRange, type HostSpec, type IpRangeSpecInput,
} from "../../../../shared/domain/ip-range-spec";
import { DEFAULT_BUSINESS_HOURS, validateBusinessHours, type BusinessHoursConfig } from "../../../../shared/domain/business-hours";
import { DEFAULT_MONITOR_INTERVALS, validateMonitorIntervals, type MonitorIntervalsConfig } from "../../../../shared/domain/monitor-intervals";
import type { StoredCredential } from "../../../../shared/domain/snmp-credential";
import type { AgentConfigUpdate } from "../entities/agent";
import { parseJsonColumn } from "./supplies-details";

/** Reglas PURAS de la configuración del agente — extraídas de `AgentConfigService`. */

/** Única rama de `buildConfigUpdates` con lógica propia: el resto son asignaciones directas. */
function buildIpRangesUpdate(raw: unknown): { column: string; warnings: string[] } {
  const validated = validateIpRangeSpecs(raw);
  return {
    column: JSON.stringify(validated),
    // `longLapWarnings` compensa que el tope (2.000 → 65.536, ver validate.ts)
    // ya no garantice una vuelta corta: el aviso también tiene que llegarle a
    // quien guarda por API, no sólo a quien usa el portal.
    warnings: [...publicIpWarnings(validated), ...overlappingCredentialWarnings(validated), ...longLapWarnings(validated)],
  };
}

/** Valida y traduce un `AgentConfigUpdate` a columnas; `warnings` son no bloqueantes. */
export function buildConfigUpdates(newConfig: AgentConfigUpdate): { updates: Record<string, unknown>; warnings: string[] } {
  const updates: Record<string, unknown> = {};
  let warnings: string[] = [];
  if (newConfig.ip_ranges !== undefined) {
    const built = buildIpRangesUpdate(newConfig.ip_ranges);
    updates.ip_ranges = built.column;
    warnings = built.warnings;
  }
  if (newConfig.snmp_community !== undefined) updates.snmp_community = newConfig.snmp_community;
  if (newConfig.scan_interval_minutes !== undefined) updates.scan_interval_minutes = newConfig.scan_interval_minutes;
  if (newConfig.name !== undefined) updates.name = newConfig.name;
  if (newConfig.toner_warning_threshold !== undefined) updates.toner_warning_threshold = newConfig.toner_warning_threshold;
  if (newConfig.toner_critical_threshold !== undefined) updates.toner_critical_threshold = newConfig.toner_critical_threshold;
  if (newConfig.business_hours !== undefined) {
    // `null` explícito = reset al default (SQL NULL) — distinto de `undefined` (no tocar).
    const validated = validateBusinessHours(newConfig.business_hours);
    updates.business_hours = validated ? JSON.stringify(validated) : null;
  }
  if (newConfig.monitor_intervals !== undefined) {
    const validated = validateMonitorIntervals(newConfig.monitor_intervals);
    updates.monitor_intervals = validated ? JSON.stringify(validated) : null;
  }
  return { updates, warnings };
}

/** Fila cruda de `agents` con las columnas de configuración. */
export interface AgentConfigRow {
  ip_ranges: unknown;
  snmp_community: string | null;
  scan_interval_minutes: number | null;
  toner_warning_threshold: number | null;
  toner_critical_threshold: number | null;
  snmp_credentials: unknown;
  business_hours: unknown;
  monitor_intervals: unknown;
}

export interface DevicePolicyRow {
  ip_address: string | null;
  monitor_state: string;
  registration_state: string;
}

/**
 * Fail-open: si `credential_ids` de un rango/host ya no matchea NINGÚN id
 * vivo, se manda el campo AUSENTE (el agente prueba el pool completo) en vez
 * de una lista vacía que lo dejaría sin ninguna credencial utilizable.
 */
function dropDanglingCredentialIds<T extends { credential_ids?: string[] }>(item: T, liveIds: Set<string>, bare: T): T {
  if (!item.credential_ids) return item;
  const live = item.credential_ids.filter((id) => liveIds.has(id));
  return live.length > 0 ? { ...item, credential_ids: live } : bare;
}

/** El heartbeat NUNCA ve CIDR/exclusiones/hostname sin resolver — sólo pares planos `{start,end}` + `ip_hosts`. */
export function buildHeartbeatRanges(rawSpecs: IpRangeSpecInput[], liveIds: Set<string>): { ip_ranges: CompiledRange[]; ip_hosts: HostSpec[] } {
  const ip_ranges = compileIpRangeSpecs(rawSpecs).map((r) => dropDanglingCredentialIds(r, liveIds, { start: r.start, end: r.end } as CompiledRange));
  const ip_hosts = extractHostSpecs(rawSpecs).map((h) => dropDanglingCredentialIds(h, liveIds, { hostname: h.hostname, label: h.label } as HostSpec));
  return { ip_ranges, ip_hosts };
}

/** `ignored` pisa el estado efectivo: si un equipo está ignorado, el agente no debería ni sondearlo. */
export function buildDevicePolicies(rows: DevicePolicyRow[]): Array<{ ip: string; state: string }> {
  return rows
    .filter((d) => d.ip_address)
    .map((d) => ({ ip: d.ip_address as string, state: d.registration_state === "ignored" ? "ignored" : d.monitor_state }));
}

export function parseStoredCredentials(value: unknown): StoredCredential[] {
  return parseJsonColumn<StoredCredential[]>(value) ?? [];
}

export function parseIpRangeSpecs(value: unknown): IpRangeSpecInput[] {
  return parseJsonColumn<IpRangeSpecInput[]>(value) ?? [];
}

export function resolveBusinessHours(value: unknown): BusinessHoursConfig {
  return parseJsonColumn<BusinessHoursConfig>(value) ?? DEFAULT_BUSINESS_HOURS;
}

export function resolveMonitorIntervals(value: unknown): MonitorIntervalsConfig {
  return parseJsonColumn<MonitorIntervalsConfig>(value) ?? DEFAULT_MONITOR_INTERVALS;
}

/** `snmp_community` legacy SIEMPRE viaja (agentes sin actualizar sólo entienden este campo). */
