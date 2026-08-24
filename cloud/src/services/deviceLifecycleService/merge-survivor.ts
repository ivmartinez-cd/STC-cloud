import { Knex } from "knex";
import { NOISE_MODEL_RE } from "../deviceIdentity";
import type { DeviceRow } from "./merge-types";

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
function buildSurvivorUpdate(target: DeviceRow, source: DeviceRow, targetSerial: string | null, sourceSerial: string | null) {
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

async function markAsTombstone(trx: Knex.Transaction, sourceId: string, targetId: string, userId: string | null | undefined): Promise<void> {
  await trx("devices").where("id", sourceId).update({
    merged_into: targetId,
    merged_at: new Date(),
    merged_by: userId ?? null,
    active: false,
  });
}

/** Aplica la precedencia de campos al target y deja al source como lápida — mismo orden que el `mergeDevices` original. */
export async function applySurvivorAndTombstone(
  trx: Knex.Transaction, target: DeviceRow, source: DeviceRow,
  targetSerial: string | null, sourceSerial: string | null, userId: string | null | undefined
): Promise<void> {
  const survivorUpdate = buildSurvivorUpdate(target, source, targetSerial, sourceSerial);
  await trx("devices").where("id", target.id).update(survivorUpdate);
  await markAsTombstone(trx, source.id, target.id, userId);
}
