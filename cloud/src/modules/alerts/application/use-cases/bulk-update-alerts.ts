import { AlertUpdateError } from "../../domain/errors/alert-error";
import type { AlertRepository } from "../../domain/repositories/alert-repository";
import { buildLifecycleUpdates, hasLifecycleUpdates } from "../../domain/services/alert-rules";
import type { AlertUnitOfWork } from "../ports/alert-unit-of-work";
import type { BulkUpdateAlertsInput, BulkUpdateAlertsResult } from "../dtos/alert-dtos";

const MAX_BULK_IDS = 500;

/**
 * Fase 9 del gap analysis vs HP SDS — acción en bloque, mismo whitelist de
 * campos y mismo criterio de propiedad que `UpdateAlertUseCase`, pero sobre
 * una lista de ids. Deliberadamente NO acepta "todo lo que matchea el filtro
 * actual" — sólo ids explícitos que el cliente ya tiene en pantalla, para que
 * un usuario nunca reconozca/resuelva alertas que no llegó a ver. Orden de
 * validaciones preservado del original: ids → body vacío → propiedad.
 */
export class BulkUpdateAlertsUseCase {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly unitOfWork: AlertUnitOfWork
  ) {}

  async execute(input: BulkUpdateAlertsInput): Promise<BulkUpdateAlertsResult> {
    const ids = validateIds(input.ids);
    const updates = buildLifecycleUpdates(input.userId, input.acknowledged, input.resolved);
    if (!hasLifecycleUpdates(updates)) {
      throw new AlertUpdateError("Nada para actualizar: se espera acknowledged y/o resolved");
    }

    const ownedIds = await this.alerts.findOwnedIds(input.scope, ids);
    const skipped = ids.filter((id) => !ownedIds.includes(id)).map((id) => ({ id, reason: "not_found" as const }));
    if (ownedIds.length === 0) return { count: 0, applied: [], skipped };

    await this.unitOfWork.run(async (tx) => {
      await tx.alerts.updateMany(ownedIds, updates);
      await tx.audit.write(bulkAuditEntry(input, ownedIds));
    });
    return { count: ownedIds.length, applied: ownedIds, skipped };
  }
}

function validateIds(ids: number[] | undefined): number[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new AlertUpdateError("ids es requerido");
  if (ids.length > MAX_BULK_IDS) throw new AlertUpdateError(`ids no puede tener más de ${MAX_BULK_IDS} elementos`);
  return ids;
}

function bulkAuditEntry(input: BulkUpdateAlertsInput, ownedIds: number[]) {
  return {
    action: "ALERTS_BULK_UPDATED",
    targetId: null,
    userId: input.userId,
    ipAddress: input.ipAddress,
    metadata: { alert_ids: ownedIds, count: ownedIds.length, acknowledged: input.acknowledged, resolved: input.resolved },
  };
}
