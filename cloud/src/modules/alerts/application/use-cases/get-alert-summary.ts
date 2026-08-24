import { ALERT_CLASS_LABELS, type AlertClass, type AlertSummary } from "../../domain/entities/alert";
import type { AlertRepository } from "../../domain/repositories/alert-repository";
import type { GetAlertSummaryInput } from "../dtos/alert-dtos";

/** `GET /alerts/summary` — agregado por clase y severidad, ya con scope aplicado. */
export class GetAlertSummaryUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(input: GetAlertSummaryInput): Promise<AlertSummary> {
    const filters = { clientId: input.clientId, resolved: input.resolved ?? "false" };
    const [byClassRows, bySeverityRows] = await Promise.all([
      this.alerts.countByClass(input.scope, filters),
      this.alerts.countBySeverity(input.scope, filters),
    ]);

    const byClass = byClassRows
      .filter((r): r is { alertClass: AlertClass; count: number } => r.alertClass !== null)
      .map((r) => ({ alertClass: r.alertClass, label: ALERT_CLASS_LABELS[r.alertClass] ?? r.alertClass, count: r.count }))
      .sort((a, b) => b.count - a.count);

    const bySeverity = { critical: 0, warning: 0 };
    for (const r of bySeverityRows) {
      if (r.severity === "critical" || r.severity === "warning") bySeverity[r.severity] = r.count;
    }
    return { byClass, bySeverity, total: bySeverity.critical + bySeverity.warning };
  }
}
