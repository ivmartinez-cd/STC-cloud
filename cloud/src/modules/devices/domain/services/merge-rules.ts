import type { DeviceRow, MergeParams, MergeResult } from "../entities/device";
import { MergeClientMismatchError, MergeError, MergeIdentityConflictError } from "../errors/merge-error";
import { NOISE_MODEL_RE, isIdentifyingSerial } from "./device-identity";

/**
 * Reglas PURAS de la fusión de duplicados. Decisión central (documentada en
 * el caso de uso): la fusión deja LÁPIDA, nunca hace DELETE — `readings`/
 * `alerts` son ON DELETE CASCADE y `report_closure_lines` ON DELETE SET NULL,
 * un borrado real destruiría historial o nulificaría cierres ya emitidos.
 */

export const DEFAULT_MAX_READINGS = 200_000;

export function resolveIdentifyingSerials(target: DeviceRow, source: DeviceRow) {
  return {
    targetSerial: isIdentifyingSerial(target.serial_number, target.ip_address) ? target.serial_number : null,
    sourceSerial: isIdentifyingSerial(source.serial_number, source.ip_address) ? source.serial_number : null,
  };
}

// Guarda de identidad física: dos seriales reales y DISTINTOS no son
// duplicados. Un merge automático nunca la fuerza.
export function assertNoIdentityConflict(targetSerial: string | null, sourceSerial: string | null, params: MergeParams): void {
  if (
    targetSerial && sourceSerial &&
    targetSerial.toUpperCase() !== sourceSerial.toUpperCase() &&
    !(params.reason === "manual" && params.force)
  ) {
    throw new MergeIdentityConflictError(
      `Los seriales difieren (${targetSerial} vs ${sourceSerial}) — no parecen el mismo equipo físico`
    );
  }
}

/** Valida que la fusión sea legal y resuelve los seriales "identificantes" de cada lado. */
export function assertMergeGuards(target: DeviceRow, source: DeviceRow, params: MergeParams) {
  if (source.merged_into) throw new MergeError("El dispositivo fuente ya fue fusionado con otro registro");
  if (target.merged_into) throw new MergeError("El destino es a su vez una lápida de fusión");
  if (target.client_id !== source.client_id) {
    throw new MergeClientMismatchError("Fusioná dentro del mismo cliente; usá Mover primero");
  }
  const serials = resolveIdentifyingSerials(target, source);
  assertNoIdentityConflict(serials.targetSerial, serials.sourceSerial, params);
  return serials;
}

export function buildIdempotentResult(target: DeviceRow, source: DeviceRow): MergeResult {
  return {
    keptId: target.id, mergedId: source.id, readingsMoved: 0, readingsDeletedOverlap: 0,
    alertsMoved: 0, alertsResolvedCollision: 0, closureLinesMoved: 0,
  };
}

function pickNewer(a: unknown, b: unknown, aTime: Date | null, bTime: Date | null) {
  if (a && !b) return a;
  if (b && !a) return b;
  if (!a && !b) return null;
  return (aTime && bTime && aTime >= bTime) ? a : b;
}

function isNoiseModel(m: string | null): boolean {
  return !m || NOISE_MODEL_RE.test(m);
}

function resolveModelAndBrand(target: DeviceRow, source: DeviceRow): { model: string | null; brand: string | null } {
  const model = isNoiseModel(target.model) && !isNoiseModel(source.model)
    ? source.model
    : (target.model || source.model);
  const brand = (target.brand && target.brand !== "unknown") ? target.brand : (source.brand || target.brand);
  return { model, brand };
}

/** Precedencia de campos en el superviviente. */
export function buildSurvivorUpdate(target: DeviceRow, source: DeviceRow, targetSerial: string | null, sourceSerial: string | null) {
  const { model, brand } = resolveModelAndBrand(target, source);
  return {
    serial_number: targetSerial || sourceSerial || target.serial_number || source.serial_number,
    mac: target.mac || source.mac,
    hostname: target.hostname || source.hostname,
    location_reported: target.location_reported || source.location_reported,
    firmware: target.firmware || source.firmware,
    sku: target.sku || source.sku,
    brand,
    model,
    total_pages: Math.max(target.total_pages ?? 0, source.total_pages ?? 0),
    mono_pages: Math.max(target.mono_pages ?? 0, source.mono_pages ?? 0),
    color_pages: Math.max(target.color_pages ?? 0, source.color_pages ?? 0),
    last_seen: pickNewer(target.last_seen, source.last_seen, target.last_seen, source.last_seen),
    created_at: target.created_at <= source.created_at ? target.created_at : source.created_at,
  };
}

export interface MergeCounts {
  readingsMoved: number;
  readingsDeletedOverlap: number;
  alertsMoved: number;
  alertsResolvedCollision: number;
  closureLinesMoved: number;
}

export function buildMergeAuditMetadata(source: DeviceRow, params: MergeParams, counts: MergeCounts) {
  return {
    reason: params.reason,
    actor: params.actor,
    request_reason: params.requestReason ?? null,
    source_device_id: source.id,
    source_serial: source.serial_number,
    source_mac: source.mac,
    source_ip: source.ip_address,
    source_agent_id: source.agent_id,
    readings_moved: counts.readingsMoved,
    readings_deleted_overlap: counts.readingsDeletedOverlap,
    alerts_moved: counts.alertsMoved,
    alerts_resolved_collision: counts.alertsResolvedCollision,
    closure_lines_moved: counts.closureLinesMoved,
  };
}
