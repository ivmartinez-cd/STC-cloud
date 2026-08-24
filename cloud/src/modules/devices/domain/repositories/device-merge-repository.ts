import type { DeviceRow } from "../entities/device";

export interface ReadingRanges {
  src_min: Date | null;
  src_max: Date | null;
  tgt_min: Date | null;
  tgt_max: Date | null;
}

/**
 * Operaciones de fila de la fusión — todas sobre la MISMA transacción (la
 * unidad de trabajo se la inyecta). El orden en que se invocan es del caso
 * de uso `MergeDevicesUseCase`, calcado del `mergeDevices` original.
 */
export interface DeviceMergeRepository {
  /** Lock en orden estable (antideadlock ante merges concurrentes con conjuntos solapados). */
  lockPair(targetId: string, sourceId: string): Promise<{ target: DeviceRow | undefined; source: DeviceRow | undefined }>;
  countReadings(deviceId: string): Promise<number>;
  readingRanges(targetId: string, sourceId: string): Promise<ReadingRanges>;
  countReadingsBetween(deviceId: string, from: Date, to: Date): Promise<number>;
  deleteReadingsBetween(deviceId: string, from: Date, to: Date): Promise<number>;
  /** Lanza `MergeError` si TimescaleDB rechaza el UPDATE por chunk comprimido. */
  moveReadings(targetId: string, sourceId: string): Promise<number>;
  /** Resuelve todas menos la más vieja por `type` entre ambos equipos (índice único parcial). */
  resolveAlertCollisions(targetId: string, sourceId: string): Promise<number>;
  moveAlerts(targetId: string, sourceId: string): Promise<number>;
  /** Reapuntar, nunca tocar los números. */
  moveClosureLines(targetId: string, sourceId: string): Promise<number>;
  /** Tabla fantasma del STC legado — sólo si existe. */
  moveLegacyMonthlyCounters(targetId: string, sourceId: string): Promise<void>;
  /** Compresión de camino: filas que ya apuntaban al source como lápida. */
  compressMergeChain(targetId: string, sourceId: string): Promise<void>;
  updateSurvivor(targetId: string, update: Record<string, unknown>): Promise<void>;
  markTombstone(sourceId: string, targetId: string, userId: string | null | undefined): Promise<void>;
}
