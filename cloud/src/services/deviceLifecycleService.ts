import { Knex } from "knex";
import { NOISE_MODEL_RE, isIdentifyingSerial } from "./deviceIdentity";

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
 */

export class MergeError extends Error {}
export class MergeIdentityConflictError extends MergeError {}
export class MergeClientMismatchError extends MergeError {}
export class MergeTooLargeError extends MergeError {
  constructor(public count: number, public max: number) {
    super(`El equipo fuente tiene ${count} lecturas (máximo permitido: ${max}); requiere un merge offline por lotes.`);
  }
}
export class MergeOverlapError extends MergeError {
  constructor(
    public from: Date,
    public to: Date,
    public sourceCount: number,
    public targetCount: number
  ) {
    super(
      `Las series de lecturas se solapan entre ${from.toISOString()} y ${to.toISOString()} ` +
      `(fuente: ${sourceCount}, destino: ${targetCount}) — elegí onOverlap para continuar.`
    );
  }
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

interface DeviceRow {
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
}

const DEFAULT_MAX_READINGS = 200_000;

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
  const run = async (trx: Knex.Transaction): Promise<MergeResult> => {
    // 0. Lock en orden estable (antideadlock ante merges concurrentes con
    //    conjuntos solapados).
    const ids = [params.targetId, params.sourceId].sort();
    const rows: DeviceRow[] = await trx("devices").whereIn("id", ids).forUpdate();
    const target = rows.find((r) => r.id === params.targetId);
    const source = rows.find((r) => r.id === params.sourceId);
    if (!target || !source) throw new MergeError("Uno de los dos dispositivos no existe");

    // Idempotencia: si el source ya está fusionado hacia el target, no-op.
    if (source.merged_into === target.id) {
      return {
        keptId: target.id, mergedId: source.id, readingsMoved: 0, readingsDeletedOverlap: 0,
        alertsMoved: 0, alertsResolvedCollision: 0, closureLinesMoved: 0,
      };
    }
    if (source.merged_into) throw new MergeError("El dispositivo fuente ya fue fusionado con otro registro");
    if (target.merged_into) throw new MergeError("El destino es a su vez una lápida de fusión");
    if (target.client_id !== source.client_id) {
      throw new MergeClientMismatchError("Fusioná dentro del mismo cliente; usá Mover primero");
    }

    // Guarda de identidad física: dos seriales reales y DISTINTOS no son
    // duplicados. Un merge automático nunca la fuerza.
    const targetSerial = isIdentifyingSerial(target.serial_number, target.ip_address) ? target.serial_number : null;
    const sourceSerial = isIdentifyingSerial(source.serial_number, source.ip_address) ? source.serial_number : null;
    if (
      targetSerial && sourceSerial &&
      targetSerial.toUpperCase() !== sourceSerial.toUpperCase() &&
      !(params.reason === "manual" && params.force)
    ) {
      throw new MergeIdentityConflictError(
        `Los seriales difieren (${targetSerial} vs ${sourceSerial}) — no parecen el mismo equipo físico`
      );
    }

    // ── readings: detectar solape temporal ──────────────────────────────
    const maxReadings = params.maxReadings ?? DEFAULT_MAX_READINGS;
    const { rows: [countRow] } = await trx.raw(
      `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ?`, [source.id]
    );
    const sourceReadingCount = Number(countRow.n);
    if (sourceReadingCount > maxReadings) {
      throw new MergeTooLargeError(sourceReadingCount, maxReadings);
    }

    const { rows: [range] } = await trx.raw(
      `SELECT
         (SELECT min(time) FROM readings WHERE device_id = ?) AS src_min,
         (SELECT max(time) FROM readings WHERE device_id = ?) AS src_max,
         (SELECT min(time) FROM readings WHERE device_id = ?) AS tgt_min,
         (SELECT max(time) FROM readings WHERE device_id = ?) AS tgt_max`,
      [source.id, source.id, target.id, target.id]
    );
    let readingsDeletedOverlap = 0;
    if (range.src_min && range.tgt_min) {
      const overlapFrom = range.src_min > range.tgt_min ? range.src_min : range.tgt_min;
      const overlapTo = range.src_max < range.tgt_max ? range.src_max : range.tgt_max;
      if (overlapFrom <= overlapTo) {
        const onOverlap = params.onOverlap ?? "abort";
        if (onOverlap === "abort") {
          const { rows: [srcN] } = await trx.raw(
            `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ? AND time BETWEEN ? AND ?`,
            [source.id, overlapFrom, overlapTo]
          );
          const { rows: [tgtN] } = await trx.raw(
            `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ? AND time BETWEEN ? AND ?`,
            [target.id, overlapFrom, overlapTo]
          );
          throw new MergeOverlapError(overlapFrom, overlapTo, Number(srcN.n), Number(tgtN.n));
        }
        const loserId = onOverlap === "keep_target" ? source.id : target.id;
        const del = await trx("readings")
          .where("device_id", loserId)
          .whereBetween("time", [overlapFrom, overlapTo])
          .del();
        readingsDeletedOverlap = del;
      }
    }

    let readingsMoved: number;
    try {
      readingsMoved = await trx("readings").where("device_id", source.id).update({ device_id: target.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/compress|chunk/i.test(msg)) {
        throw new MergeError(
          `No se pudo mover lecturas: chunk comprimido de TimescaleDB (${msg}). Requiere descomprimir manualmente antes de fusionar.`
        );
      }
      throw err;
    }

    // ── alerts: resolver colisiones ANTES de reapuntar ──────────────────
    // El índice único parcial es (device_id, type) WHERE resolved=false.
    // Reapuntar a ciegas explota si target Y source tienen una abierta del
    // mismo type. Se rankea por antigüedad y se resuelve todo menos la más
    // vieja, ANTES del UPDATE de reapuntado.
    const { rowCount: alertsResolvedCollision } = await trx.raw(
      `WITH ranked AS (
         SELECT id, row_number() OVER (PARTITION BY type ORDER BY created_at ASC, id ASC) AS rn
           FROM alerts WHERE device_id IN (?, ?) AND resolved = false
       )
       UPDATE alerts SET resolved = true, resolved_at = now()
         FROM ranked WHERE alerts.id = ranked.id AND ranked.rn > 1`,
      [target.id, source.id]
    );
    const { rowCount: alertsMoved } = await trx.raw(
      `UPDATE alerts SET device_id = ? WHERE device_id = ?`, [target.id, source.id]
    );

    // ── report_closure_lines: reapuntar, nunca tocar los números ────────
    const { rowCount: closureLinesMoved } = await trx.raw(
      `UPDATE report_closure_lines SET device_id = ? WHERE device_id = ?`, [target.id, source.id]
    );

    // ── monthly_counters: fantasma del STC legado, ninguna migración la
    //    crea. Si existiera, reapuntar (NUNCA borrar) — pero no se replica
    //    activamente acá para no depender de una tabla que no existe.
    const hasMonthlyCounters = await trx.schema.hasTable("monthly_counters");
    if (hasMonthlyCounters) {
      await trx("monthly_counters").where("device_id", source.id).update({ device_id: target.id });
    }

    // ── compresión de camino: filas que ya apuntaban al source como lápida
    await trx("devices").where("merged_into", source.id).update({ merged_into: target.id });

    // ── precedencia de campos en el superviviente ───────────────────────
    const pickNewer = (a: unknown, b: unknown, aTime: Date | null, bTime: Date | null) => {
      if (a && !b) return a;
      if (b && !a) return b;
      if (!a && !b) return null;
      return (aTime && bTime && aTime >= bTime) ? a : b;
    };
    const isNoise = (m: string | null) => !m || NOISE_MODEL_RE.test(m);
    const finalModel = isNoise(target.model) && !isNoise(source.model)
      ? source.model
      : (target.model || source.model);
    const finalBrand = (target.brand && target.brand !== "unknown") ? target.brand : (source.brand || target.brand);

    await trx("devices").where("id", target.id).update({
      serial_number: targetSerial || sourceSerial || target.serial_number || source.serial_number,
      mac: target.mac || source.mac,
      hostname: target.hostname || source.hostname,
      location_reported: target.location_reported || source.location_reported,
      firmware: target.firmware || source.firmware,
      sku: target.sku || source.sku,
      brand: finalBrand,
      model: finalModel,
      total_pages: Math.max(target.total_pages ?? 0, source.total_pages ?? 0),
      mono_pages: Math.max(target.mono_pages ?? 0, source.mono_pages ?? 0),
      color_pages: Math.max(target.color_pages ?? 0, source.color_pages ?? 0),
      last_seen: pickNewer(target.last_seen, source.last_seen, target.last_seen, source.last_seen),
      created_at: target.created_at <= source.created_at ? target.created_at : source.created_at,
    });

    // ── lápida ───────────────────────────────────────────────────────────
    await trx("devices").where("id", source.id).update({
      merged_into: target.id,
      merged_at: new Date(),
      merged_by: params.userId ?? null,
      active: false,
    });

    await trx("audit_logs").insert({
      action: "DEVICE_MERGED",
      target_id: String(target.id),
      user_id: params.userId ?? null,
      ip_address: params.ip ?? null,
      metadata: JSON.stringify({
        reason: params.reason,
        actor: params.actor,
        request_reason: params.requestReason ?? null,
        source_device_id: source.id,
        source_serial: source.serial_number,
        source_mac: source.mac,
        source_ip: source.ip_address,
        source_agent_id: source.agent_id,
        readings_moved: readingsMoved,
        readings_deleted_overlap: readingsDeletedOverlap,
        alerts_moved: alertsMoved,
        alerts_resolved_collision: alertsResolvedCollision,
        closure_lines_moved: closureLinesMoved,
      }),
    });

    return {
      keptId: target.id,
      mergedId: source.id,
      readingsMoved,
      readingsDeletedOverlap,
      alertsMoved,
      alertsResolvedCollision,
      closureLinesMoved,
    };
  };

  if (existingTrx) return run(existingTrx);
  return db.transaction(run);
}
