import { Knex } from "knex";
import { isIdentifyingSerial } from "../deviceIdentity";
import { writeAudit } from "../auditService";
import { applySurvivorAndTombstone } from "./merge-survivor";
import {
  MergeError, MergeIdentityConflictError, MergeClientMismatchError, MergeTooLargeError, MergeOverlapError,
  type MergeParams, type MergeResult, type DeviceRow,
} from "./merge-types";

/**
 * Ciclo de vida de dispositivos: fusión de duplicados. Reemplaza las tres
 * rutinas de "fantasma" inconsistentes que existían antes de esta pasada
 * (purga no transaccional en `agentService.syncReadings`, promoción en el
 * lugar en `agentService.registerDevices`, y el SQL de la migración
 * `20260511000008`). Ninguna de esas tocaba `report_closure_lines`, y la
 * primera destruía `alerts` por CASCADE.
 *
 * Decisión central: la fusión deja LÁPIDA, nunca hace DELETE. El perdedor
 * sobrevive con `merged_into` apuntando al superviviente. Esto evita los tres
 * modos de falla silenciosa de un borrado real: `readings`/`alerts` son
 * ON DELETE CASCADE (perderían su historial) y `report_closure_lines` es
 * ON DELETE SET NULL (nulificaría líneas de cierres YA EMITIDOS sin error —
 * como los campos están denormalizados, el CSV seguiría viéndose igual y
 * nadie lo notaría nunca).
 *
 * NOTA (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md): `mergeDevices`
 * pasó por dos pasadas — primero se movió verbatim (demasiado crítico para
 * decomponer en la misma pasada que el resto del módulo), después se
 * decompuso acá (+ `merge-survivor.ts`) en funciones nombradas por paso, cada
 * una operando sobre la MISMA transacción (`trx`) y en el MISMO orden que el
 * original — extracción mecánica, ninguna regla de negocio cambió.
 */

const DEFAULT_MAX_READINGS = 200_000;

async function lockDevicePair(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<{ target: DeviceRow; source: DeviceRow }> {
  // Lock en orden estable (antideadlock ante merges concurrentes con conjuntos solapados).
  const ids = [targetId, sourceId].sort();
  const rows: DeviceRow[] = await trx("devices").whereIn("id", ids).forUpdate();
  const target = rows.find((r) => r.id === targetId);
  const source = rows.find((r) => r.id === sourceId);
  if (!target || !source) throw new MergeError("Uno de los dos dispositivos no existe");
  return { target, source };
}

function buildIdempotentResult(target: DeviceRow, source: DeviceRow): MergeResult {
  return {
    keptId: target.id, mergedId: source.id, readingsMoved: 0, readingsDeletedOverlap: 0,
    alertsMoved: 0, alertsResolvedCollision: 0, closureLinesMoved: 0,
  };
}

function resolveIdentifyingSerials(target: DeviceRow, source: DeviceRow) {
  return {
    targetSerial: isIdentifyingSerial(target.serial_number, target.ip_address) ? target.serial_number : null,
    sourceSerial: isIdentifyingSerial(source.serial_number, source.ip_address) ? source.serial_number : null,
  };
}

// Guarda de identidad física: dos seriales reales y DISTINTOS no son
// duplicados. Un merge automático nunca la fuerza.
function assertNoIdentityConflict(targetSerial: string | null, sourceSerial: string | null, params: MergeParams): void {
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
function assertMergeGuards(target: DeviceRow, source: DeviceRow, params: MergeParams): { targetSerial: string | null; sourceSerial: string | null } {
  if (source.merged_into) throw new MergeError("El dispositivo fuente ya fue fusionado con otro registro");
  if (target.merged_into) throw new MergeError("El destino es a su vez una lápida de fusión");
  if (target.client_id !== source.client_id) {
    throw new MergeClientMismatchError("Fusioná dentro del mismo cliente; usá Mover primero");
  }
  const { targetSerial, sourceSerial } = resolveIdentifyingSerials(target, source);
  assertNoIdentityConflict(targetSerial, sourceSerial, params);
  return { targetSerial, sourceSerial };
}

async function assertReadingCountWithinLimit(trx: Knex.Transaction, sourceId: string, maxReadings: number): Promise<void> {
  const { rows: [countRow] } = await trx.raw(
    `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ?`, [sourceId]
  );
  const sourceReadingCount = Number(countRow.n);
  if (sourceReadingCount > maxReadings) {
    throw new MergeTooLargeError(sourceReadingCount, maxReadings);
  }
}

async function throwOverlapError(
  trx: Knex.Transaction, targetId: string, sourceId: string, overlapFrom: Date, overlapTo: Date
): Promise<never> {
  const { rows: [srcN] } = await trx.raw(
    `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ? AND time BETWEEN ? AND ?`,
    [sourceId, overlapFrom, overlapTo]
  );
  const { rows: [tgtN] } = await trx.raw(
    `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ? AND time BETWEEN ? AND ?`,
    [targetId, overlapFrom, overlapTo]
  );
  throw new MergeOverlapError(overlapFrom, overlapTo, Number(srcN.n), Number(tgtN.n));
}

/** Detecta solape temporal de `readings` entre target/source y lo resuelve según `onOverlap`. Devuelve cuántas filas se borraron por solape (0 si no hubo). */
async function resolveReadingOverlap(
  trx: Knex.Transaction, targetId: string, sourceId: string, onOverlap: "abort" | "keep_target" | "keep_source"
): Promise<number> {
  const { rows: [range] } = await trx.raw(
    `SELECT
       (SELECT min(time) FROM readings WHERE device_id = ?) AS src_min,
       (SELECT max(time) FROM readings WHERE device_id = ?) AS src_max,
       (SELECT min(time) FROM readings WHERE device_id = ?) AS tgt_min,
       (SELECT max(time) FROM readings WHERE device_id = ?) AS tgt_max`,
    [sourceId, sourceId, targetId, targetId]
  );
  if (!(range.src_min && range.tgt_min)) return 0;

  const overlapFrom = range.src_min > range.tgt_min ? range.src_min : range.tgt_min;
  const overlapTo = range.src_max < range.tgt_max ? range.src_max : range.tgt_max;
  if (overlapFrom > overlapTo) return 0;

  if (onOverlap === "abort") return throwOverlapError(trx, targetId, sourceId, overlapFrom, overlapTo);

  const loserId = onOverlap === "keep_target" ? sourceId : targetId;
  return await trx("readings").where("device_id", loserId).whereBetween("time", [overlapFrom, overlapTo]).del();
}

async function moveReadings(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<number> {
  try {
    return await trx("readings").where("device_id", sourceId).update({ device_id: targetId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/compress|chunk/i.test(msg)) {
      throw new MergeError(
        `No se pudo mover lecturas: chunk comprimido de TimescaleDB (${msg}). Requiere descomprimir manualmente antes de fusionar.`
      );
    }
    throw err;
  }
}

async function moveReadingsPhase(
  trx: Knex.Transaction, targetId: string, sourceId: string, maxReadings: number, onOverlap: "abort" | "keep_target" | "keep_source"
): Promise<{ readingsMoved: number; readingsDeletedOverlap: number }> {
  await assertReadingCountWithinLimit(trx, sourceId, maxReadings);
  const readingsDeletedOverlap = await resolveReadingOverlap(trx, targetId, sourceId, onOverlap);
  const readingsMoved = await moveReadings(trx, targetId, sourceId);
  return { readingsMoved, readingsDeletedOverlap };
}

// El índice único parcial es (device_id, type) WHERE resolved=false. Reapuntar
// a ciegas explota si target Y source tienen una abierta del mismo type. Se
// rankea por antigüedad y se resuelve todo menos la más vieja, ANTES del
// UPDATE de reapuntado.
async function resolveAlertCollisions(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<number> {
  const { rowCount } = await trx.raw(
    `WITH ranked AS (
       SELECT id, row_number() OVER (PARTITION BY type ORDER BY created_at ASC, id ASC) AS rn
         FROM alerts WHERE device_id IN (?, ?) AND resolved = false
     )
     UPDATE alerts SET resolved = true, resolved_at = now()
       FROM ranked WHERE alerts.id = ranked.id AND ranked.rn > 1`,
    [targetId, sourceId]
  );
  return rowCount;
}

async function moveAlerts(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<number> {
  const { rowCount } = await trx.raw(`UPDATE alerts SET device_id = ? WHERE device_id = ?`, [targetId, sourceId]);
  return rowCount;
}

async function moveAlertsPhase(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<{ alertsMoved: number; alertsResolvedCollision: number }> {
  const alertsResolvedCollision = await resolveAlertCollisions(trx, targetId, sourceId);
  const alertsMoved = await moveAlerts(trx, targetId, sourceId);
  return { alertsMoved, alertsResolvedCollision };
}

/** Reapuntar, nunca tocar los números. */
async function moveClosureLines(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<number> {
  const { rowCount } = await trx.raw(`UPDATE report_closure_lines SET device_id = ? WHERE device_id = ?`, [targetId, sourceId]);
  return rowCount;
}

// Fantasma del STC legado, ninguna migración la crea. Si existiera, reapuntar
// (NUNCA borrar) — pero no se replica activamente acá para no depender de una
// tabla que no existe.
async function moveLegacyMonthlyCounters(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<void> {
  const hasMonthlyCounters = await trx.schema.hasTable("monthly_counters");
  if (hasMonthlyCounters) {
    await trx("monthly_counters").where("device_id", sourceId).update({ device_id: targetId });
  }
}

/** Compresión de camino: filas que ya apuntaban al source como lápida. */
async function compressMergeChain(trx: Knex.Transaction, targetId: string, sourceId: string): Promise<void> {
  await trx("devices").where("merged_into", sourceId).update({ merged_into: targetId });
}

interface MergeCounts {
  readingsMoved: number;
  readingsDeletedOverlap: number;
  alertsMoved: number;
  alertsResolvedCollision: number;
  closureLinesMoved: number;
}

function buildMergeAuditMetadata(source: DeviceRow, params: MergeParams, counts: MergeCounts) {
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

async function writeMergeAudit(trx: Knex.Transaction, target: DeviceRow, source: DeviceRow, params: MergeParams, counts: MergeCounts): Promise<void> {
  await writeAudit(trx, {
    action: "DEVICE_MERGED",
    targetId: String(target.id),
    clientId: target.client_id,
    userId: params.userId ?? null,
    ip: params.ip ?? null,
    metadata: buildMergeAuditMetadata(source, params, counts),
  });
}

async function runMerge(trx: Knex.Transaction, params: MergeParams): Promise<MergeResult> {
  const { target, source } = await lockDevicePair(trx, params.targetId, params.sourceId);

  // Idempotencia: si el source ya está fusionado hacia el target, no-op.
  if (source.merged_into === target.id) {
    return buildIdempotentResult(target, source);
  }

  const { targetSerial, sourceSerial } = assertMergeGuards(target, source, params);
  const maxReadings = params.maxReadings ?? DEFAULT_MAX_READINGS;

  const { readingsMoved, readingsDeletedOverlap } = await moveReadingsPhase(
    trx, target.id, source.id, maxReadings, params.onOverlap ?? "abort"
  );
  const { alertsMoved, alertsResolvedCollision } = await moveAlertsPhase(trx, target.id, source.id);
  const closureLinesMoved = await moveClosureLines(trx, target.id, source.id);
  await moveLegacyMonthlyCounters(trx, target.id, source.id);
  await compressMergeChain(trx, target.id, source.id);
  await applySurvivorAndTombstone(trx, target, source, targetSerial, sourceSerial, params.userId);

  const counts: MergeCounts = { readingsMoved, readingsDeletedOverlap, alertsMoved, alertsResolvedCollision, closureLinesMoved };
  await writeMergeAudit(trx, target, source, params, counts);

  return { keptId: target.id, mergedId: source.id, ...counts };
}

/**
 * Primitiva única de fusión. Corre en UNA transacción (abre la suya si no se
 * le pasa una — para que la ingesta la componga con su propia transacción de
 * sync). `target` sobrevive, `source` queda lápida.
 */
export async function mergeDevices(
  db: Knex,
  params: MergeParams,
  existingTrx?: Knex.Transaction
): Promise<MergeResult> {
  if (existingTrx) return runMerge(existingTrx, params);
  return db.transaction((trx) => runMerge(trx, params));
}
