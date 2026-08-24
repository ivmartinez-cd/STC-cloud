import type { ClosureTotals, ReportClosure } from "../../domain/entities/report-closure";
import { ClosurePeriodConflictError } from "../../domain/errors/report-error";
import { parsePeriod, sumUsageTotals } from "../../domain/services/period";
import type { ReportDeliveryEnqueuer } from "../ports/report-delivery-enqueuer";
import type { ReportTransactionScope, ReportUnitOfWork } from "../ports/report-unit-of-work";
import type { ClosePeriodInput } from "../dtos/report-dtos";

/**
 * Cierra un período. Si ya hay un cierre `closed` para (client, period) →
 * `ClosurePeriodConflictError` (409): un cierre existente nunca se
 * sobreescribe, sólo se puede reabrir primero. Si hay uno `reopened` sin
 * reemplazar, este cierre nuevo lo reemplaza y linkea `supersededBy` en el
 * viejo — el viejo sigue existiendo (montos intactos) como historial de que
 * hubo un ajuste. Header + líneas + audit en UNA transacción; la entrega se
 * encola DESPUÉS del commit (ver `ReportDeliveryEnqueuer`).
 */
export class ClosePeriodUseCase {
  constructor(
    private readonly unitOfWork: ReportUnitOfWork,
    private readonly delivery: ReportDeliveryEnqueuer
  ) {}

  async execute(input: ClosePeriodInput): Promise<ReportClosure> {
    const closure = await this.unitOfWork.run((tx) => this.closeInTransaction(tx, input));
    await this.delivery.enqueueReportClosed(closure.id);
    return closure;
  }

  private async closeInTransaction(tx: ReportTransactionScope, input: ClosePeriodInput): Promise<ReportClosure> {
    const { periodStart } = parsePeriod(input.period);
    if (await tx.closures.findClosed(input.clientId, periodStart)) {
      throw new ClosurePeriodConflictError(input.period);
    }
    const reopened = await tx.closures.findReopenedUnsuperseded(input.clientId, periodStart);
    const lines = await tx.usage.compute(input.clientId, input.period);
    const totals = sumUsageTotals(lines);

    const closure = await tx.closures.insertClosure({ clientId: input.clientId, periodStart, closedBy: input.userId, ...totals });
    if (lines.length > 0) await tx.closures.insertLines(closure.id, lines);
    if (reopened) await tx.closures.markSuperseded(reopened.id, closure.id);

    await tx.audit.write(closedAuditEntry(input, closure, lines.length, totals, reopened?.id ?? null));
    return closure;
  }
}

function closedAuditEntry(input: ClosePeriodInput, closure: ReportClosure, deviceCount: number, totals: ClosureTotals, supersedes: string | null) {
  return {
    action: "REPORT_PERIOD_CLOSED",
    targetId: String(closure.id),
    userId: input.userId,
    ipAddress: input.ipAddress,
    metadata: {
      client_id: input.clientId,
      period: input.period,
      device_count: deviceCount,
      totals: { total_pages: totals.totalPages, total_mono: totals.totalMono, total_color: totals.totalColor },
      supersedes,
    },
  };
}
