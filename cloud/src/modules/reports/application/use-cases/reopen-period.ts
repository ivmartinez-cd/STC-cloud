import type { ReportClosure } from "../../domain/entities/report-closure";
import { ClosureNotFoundError, ClosureNotReopenableError } from "../../domain/errors/report-error";
import type { ReportUnitOfWork } from "../ports/report-unit-of-work";
import type { ReopenPeriodInput } from "../dtos/report-dtos";

/**
 * Reabre un cierre — sólo cambia estado/auditoría (`status`, `reopened_at`,
 * `reopened_by`, `reopen_reason`). NUNCA toca las columnas numéricas del
 * cierre ni de sus líneas. Libera el período para un cierre nuevo (que es
 * quien linkea `supersededBy` en éste). Orden de chequeos preservado del
 * controller original: 404 por no-propiedad, 400 si no está `closed`.
 */
export class ReopenPeriodUseCase {
  constructor(private readonly unitOfWork: ReportUnitOfWork) {}

  async execute(input: ReopenPeriodInput): Promise<ReportClosure | null> {
    return this.unitOfWork.run(async (tx) => {
      const owned = await tx.closures.findOwned(input.closureId, input.clientId);
      if (!owned) throw new ClosureNotFoundError();
      if (owned.status !== "closed") throw new ClosureNotReopenableError();

      const updated = await tx.closures.reopen(input.closureId, { reopenedBy: input.userId, reason: input.reason });
      if (!updated) return null;
      await tx.audit.write({
        action: "REPORT_PERIOD_REOPENED",
        targetId: String(input.closureId),
        userId: input.userId,
        ipAddress: input.ipAddress,
        metadata: { reason: input.reason },
      });
      return updated;
    });
  }
}
