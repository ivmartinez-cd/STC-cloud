import {
  ALERT_CLASS_LABELS, DIAGNOSTIC_CODE_LABELS, type AlertClass, type AlertCodeCount, type AlertSummary,
} from "../../domain/entities/alert";
import type { AlertRepository } from "../../domain/repositories/alert-repository";
import type { GetAlertSummaryInput } from "../dtos/alert-dtos";

function labelForCode(code: string): string {
  return DIAGNOSTIC_CODE_LABELS[code] ?? ALERT_CLASS_LABELS[code as AlertClass] ?? code;
}

function toByCode(rows: Array<{ code: string | null; count: number }>): AlertCodeCount[] {
  return rows
    .filter((r): r is { code: string; count: number } => r.code !== null)
    .map((r) => ({ code: r.code, label: labelForCode(r.code), count: r.count }))
    .sort((a, b) => b.count - a.count);
}

/** `GET /alerts/summary` — agregado por clase, código y severidad, ya con scope aplicado. */
export class GetAlertSummaryUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(input: GetAlertSummaryInput): Promise<AlertSummary> {
    const filters = { clientId: input.clientId, resolved: input.resolved ?? "false" };
    const [byClassRows, byCodeRows, bySeverityRows, clientsAffected] = await Promise.all([
      this.alerts.countByClass(input.scope, filters),
      this.alerts.countByCode(input.scope, filters),
      this.alerts.countBySeverity(input.scope, filters),
      this.alerts.countDistinctClients(input.scope, filters),
    ]);

    const byClass = byClassRows
      .filter((r): r is { alertClass: AlertClass; count: number } => r.alertClass !== null)
      .map((r) => ({ alertClass: r.alertClass, label: ALERT_CLASS_LABELS[r.alertClass] ?? r.alertClass, count: r.count }))
      .sort((a, b) => b.count - a.count);

    const bySeverity = { critical: 0, warning: 0 };
    for (const r of bySeverityRows) {
      if (r.severity === "critical" || r.severity === "warning") bySeverity[r.severity] = r.count;
    }
    return { byClass, byCode: toByCode(byCodeRows), bySeverity, total: bySeverity.critical + bySeverity.warning, clientsAffected };
  }
}
