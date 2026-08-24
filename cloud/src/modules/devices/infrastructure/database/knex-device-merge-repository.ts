import type { Knex } from "knex";
import type { DeviceRow } from "../../domain/entities/device";
import { MergeError } from "../../domain/errors/merge-error";
import type { DeviceMergeRepository, ReadingRanges } from "../../domain/repositories/device-merge-repository";

/** Operaciones de fila de la fusión — SIEMPRE sobre la transacción que inyecta la unidad de trabajo. */
export class KnexDeviceMergeRepository implements DeviceMergeRepository {
  constructor(private readonly trx: Knex.Transaction) {}

  async lockPair(targetId: string, sourceId: string) {
    // Lock en orden estable (antideadlock ante merges concurrentes con conjuntos solapados).
    const ids = [targetId, sourceId].sort();
    const rows: DeviceRow[] = await this.trx("devices").whereIn("id", ids).forUpdate();
    return { target: rows.find((r) => r.id === targetId), source: rows.find((r) => r.id === sourceId) };
  }

  async countReadings(deviceId: string): Promise<number> {
    const { rows: [row] } = await this.trx.raw(`SELECT count(*)::bigint AS n FROM readings WHERE device_id = ?`, [deviceId]);
    return Number(row.n);
  }

  async readingRanges(targetId: string, sourceId: string): Promise<ReadingRanges> {
    const { rows: [range] } = await this.trx.raw(
      `SELECT
         (SELECT min(time) FROM readings WHERE device_id = ?) AS src_min,
         (SELECT max(time) FROM readings WHERE device_id = ?) AS src_max,
         (SELECT min(time) FROM readings WHERE device_id = ?) AS tgt_min,
         (SELECT max(time) FROM readings WHERE device_id = ?) AS tgt_max`,
      [sourceId, sourceId, targetId, targetId]
    );
    return range;
  }

  async countReadingsBetween(deviceId: string, from: Date, to: Date): Promise<number> {
    const { rows: [row] } = await this.trx.raw(
      `SELECT count(*)::bigint AS n FROM readings WHERE device_id = ? AND time BETWEEN ? AND ?`, [deviceId, from, to]
    );
    return Number(row.n);
  }

  deleteReadingsBetween(deviceId: string, from: Date, to: Date): Promise<number> {
    return this.trx("readings").where("device_id", deviceId).whereBetween("time", [from, to]).del();
  }

  async moveReadings(targetId: string, sourceId: string): Promise<number> {
    try {
      return await this.trx("readings").where("device_id", sourceId).update({ device_id: targetId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/compress|chunk/i.test(msg)) {
        throw new MergeError(`No se pudo mover lecturas: chunk comprimido de TimescaleDB (${msg}). Requiere descomprimir manualmente antes de fusionar.`);
      }
      throw err;
    }
  }

  // El índice único parcial es (device_id, type) WHERE resolved=false. Reapuntar
  // a ciegas explota si target Y source tienen una abierta del mismo type. Se
  // rankea por antigüedad y se resuelve todo menos la más vieja, ANTES del
  // UPDATE de reapuntado.
  async resolveAlertCollisions(targetId: string, sourceId: string): Promise<number> {
    const { rowCount } = await this.trx.raw(
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

  async moveAlerts(targetId: string, sourceId: string): Promise<number> {
    const { rowCount } = await this.trx.raw(`UPDATE alerts SET device_id = ? WHERE device_id = ?`, [targetId, sourceId]);
    return rowCount;
  }

  async moveClosureLines(targetId: string, sourceId: string): Promise<number> {
    const { rowCount } = await this.trx.raw(`UPDATE report_closure_lines SET device_id = ? WHERE device_id = ?`, [targetId, sourceId]);
    return rowCount;
  }

  // Fantasma del STC legado, ninguna migración la crea. Si existiera, reapuntar (NUNCA borrar).
  async moveLegacyMonthlyCounters(targetId: string, sourceId: string): Promise<void> {
    if (await this.trx.schema.hasTable("monthly_counters")) {
      await this.trx("monthly_counters").where("device_id", sourceId).update({ device_id: targetId });
    }
  }

  async compressMergeChain(targetId: string, sourceId: string): Promise<void> {
    await this.trx("devices").where("merged_into", sourceId).update({ merged_into: targetId });
  }

  async updateSurvivor(targetId: string, update: Record<string, unknown>): Promise<void> {
    await this.trx("devices").where("id", targetId).update(update);
  }

  async markTombstone(sourceId: string, targetId: string, userId: string | null | undefined): Promise<void> {
    await this.trx("devices").where("id", sourceId).update({ merged_into: targetId, merged_at: new Date(), merged_by: userId ?? null, active: false });
  }
}
