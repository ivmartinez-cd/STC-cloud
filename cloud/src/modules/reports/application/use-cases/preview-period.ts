import type { PeriodUsageQuery } from "../../domain/repositories/period-usage-query";
import type { PreviewPeriodInput, PreviewPeriodResult } from "../dtos/report-dtos";

/** `GET /clients/:id/reports/preview` — no persiste nada; muestra lo que cerraría `ClosePeriodUseCase`. */
export class PreviewPeriodUseCase {
  constructor(private readonly usage: PeriodUsageQuery) {}

  async execute(input: PreviewPeriodInput): Promise<PreviewPeriodResult> {
    const lines = await this.usage.compute(input.clientId, input.period);
    return { period: input.period, lines };
  }
}
