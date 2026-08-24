import type { DeviceRow, MergeParams, MergeResult } from "../../domain/entities/device";
import { DeviceNotFoundError, DeviceValidationError } from "../../domain/errors/device-error";
import { MergeError, MergeOverlapError, MergeTooLargeError } from "../../domain/errors/merge-error";
import type { DeviceMergeRepository } from "../../domain/repositories/device-merge-repository";
import {
  DEFAULT_MAX_READINGS, assertMergeGuards, buildIdempotentResult, buildMergeAuditMetadata, buildSurvivorUpdate, type MergeCounts,
} from "../../domain/services/merge-rules";
import { RollbackSignal, type DeviceTransactionScope, type DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { MergeDeviceRequest } from "../dtos/device-dtos";

type OnOverlap = "abort" | "keep_target" | "keep_source";

/**
 * Fusión de duplicados — primitiva única. Decisión central: la fusión deja
 * LÁPIDA (`merged_into`), nunca hace DELETE: `readings`/`alerts` son
 * ON DELETE CASCADE (perderían su historial) y `report_closure_lines` es
 * ON DELETE SET NULL (nulificaría líneas de cierres YA EMITIDOS sin error).
 * Corre en UNA transacción; `executeIn` permite componerla con la
 * transacción propia de la ingesta (`agentService`).
 */
export class MergeDevicesUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  execute(params: MergeParams): Promise<MergeResult> {
    return this.unitOfWork.run((tx) => this.executeIn(tx, params));
  }

  /** Dry-run real: corre el merge dentro de una transacción que SIEMPRE se revierte. */
  async plan(params: MergeParams): Promise<MergeResult | null> {
    let planResult: MergeResult | null = null;
    await this.unitOfWork
      .run(async (tx) => { planResult = await this.executeIn(tx, params); throw new RollbackSignal(); })
      .catch((e) => { if (!(e instanceof RollbackSignal)) throw e; });
    return planResult;
  }

  async executeIn(tx: DeviceTransactionScope, params: MergeParams): Promise<MergeResult> {
    const { target, source } = await tx.merge.lockPair(params.targetId, params.sourceId);
    if (!target || !source) throw new MergeError("Uno de los dos dispositivos no existe");
    // Idempotencia: si el source ya está fusionado hacia el target, no-op.
    if (source.merged_into === target.id) return buildIdempotentResult(target, source);

    const { targetSerial, sourceSerial } = assertMergeGuards(target, source, params);
    const readings = await moveReadingsPhase(tx.merge, target.id, source.id, params.maxReadings ?? DEFAULT_MAX_READINGS, params.onOverlap ?? "abort");
    const alertsResolvedCollision = await tx.merge.resolveAlertCollisions(target.id, source.id);
    const alertsMoved = await tx.merge.moveAlerts(target.id, source.id);
    const closureLinesMoved = await tx.merge.moveClosureLines(target.id, source.id);
    await tx.merge.moveLegacyMonthlyCounters(target.id, source.id);
    await tx.merge.compressMergeChain(target.id, source.id);
    await tx.merge.updateSurvivor(target.id, buildSurvivorUpdate(target, source, targetSerial, sourceSerial));
    await tx.merge.markTombstone(source.id, target.id, params.userId);

    const counts: MergeCounts = { ...readings, alertsMoved, alertsResolvedCollision, closureLinesMoved };
    await writeMergeAudit(tx, target, source, params, counts);
    return { keptId: target.id, mergedId: source.id, ...counts };
  }
}

async function moveReadingsPhase(merge: DeviceMergeRepository, targetId: string, sourceId: string, maxReadings: number, onOverlap: OnOverlap) {
  const sourceReadingCount = await merge.countReadings(sourceId);
  if (sourceReadingCount > maxReadings) throw new MergeTooLargeError(sourceReadingCount, maxReadings);
  const readingsDeletedOverlap = await resolveReadingOverlap(merge, targetId, sourceId, onOverlap);
  const readingsMoved = await merge.moveReadings(targetId, sourceId);
  return { readingsMoved, readingsDeletedOverlap };
}

/** Detecta solape temporal de `readings` entre target/source y lo resuelve según `onOverlap`. */
async function resolveReadingOverlap(merge: DeviceMergeRepository, targetId: string, sourceId: string, onOverlap: OnOverlap): Promise<number> {
  const range = await merge.readingRanges(targetId, sourceId);
  if (!(range.src_min && range.tgt_min)) return 0;
  const overlapFrom = range.src_min > range.tgt_min ? range.src_min : range.tgt_min;
  const overlapTo = (range.src_max as Date) < (range.tgt_max as Date) ? (range.src_max as Date) : (range.tgt_max as Date);
  if (overlapFrom > overlapTo) return 0;
  if (onOverlap === "abort") {
    const [srcN, tgtN] = await Promise.all([
      merge.countReadingsBetween(sourceId, overlapFrom, overlapTo),
      merge.countReadingsBetween(targetId, overlapFrom, overlapTo),
    ]);
    throw new MergeOverlapError(overlapFrom, overlapTo, srcN, tgtN);
  }
  const loserId = onOverlap === "keep_target" ? sourceId : targetId;
  return merge.deleteReadingsBetween(loserId, overlapFrom, overlapTo);
}

function writeMergeAudit(tx: DeviceTransactionScope, target: DeviceRow, source: DeviceRow, params: MergeParams, counts: MergeCounts) {
  return tx.audit.write({
    action: "DEVICE_MERGED", targetId: String(target.id), clientId: target.client_id,
    userId: params.userId ?? null, ipAddress: params.ip ?? null,
    metadata: buildMergeAuditMetadata(source, params, counts),
  });
}

/** `POST /devices/:id/merge` — validación del request + scope + dry-run, encima de la primitiva. */
export class MergeDeviceRequestUseCase {
  constructor(private readonly merge: MergeDevicesUseCase, private readonly countOwned: (ids: string[], clientId: string) => Promise<number>) {}

  async execute(input: MergeDeviceRequest): Promise<MergeResult | { dryRun: true; plan: MergeResult | null }> {
    if (!input.sourceDeviceId) throw new DeviceValidationError("sourceDeviceId es requerido");
    if (input.sourceDeviceId === input.id) throw new DeviceValidationError("No se puede fusionar un equipo consigo mismo");
    if (input.scope.kind === "client" && (await this.countOwned([input.id, input.sourceDeviceId], input.scope.id)) < 2) {
      throw new DeviceNotFoundError();
    }
    const params: MergeParams = {
      targetId: input.id, sourceId: input.sourceDeviceId, reason: "manual", actor: "portal",
      userId: input.userId, ip: input.ipAddress, requestReason: input.reason ?? null,
      onOverlap: input.onOverlap, force: input.force,
    };
    if (input.dryRun) return { dryRun: true, plan: await this.merge.plan(params) };
    return this.merge.execute(params);
  }
}
