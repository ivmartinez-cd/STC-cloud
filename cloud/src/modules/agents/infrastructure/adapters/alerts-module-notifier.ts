import type { Knex } from "knex";
import * as alerts from "../../../alerts";
import type { AlertNotifier } from "../../application/ports/alert-notifier";

/** Adapter sobre la fachada de `modules/alerts` (aplica el gate de monitor_state/registration_state). */
export class AlertsModuleNotifier implements AlertNotifier {
  constructor(private readonly db: Knex) {}

  async open(params: Parameters<AlertNotifier["open"]>[0]): Promise<void> {
    await alerts.openAlert(this.db, params);
  }

  async resolve(params: { deviceId: string; type: string }): Promise<void> {
    await alerts.resolveAlert(this.db, params);
  }

  async resolveStaleDeviceAlerts(params: { deviceId: string; currentTypes: string[] }): Promise<void> {
    await alerts.resolveStaleDeviceAlerts(this.db, params);
  }

  synthesizeEwsAlertType(code: string | undefined | null, message: string): string {
    return alerts.synthesizeEwsAlertType(code, message);
  }
}
