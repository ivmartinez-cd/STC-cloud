/**
 * Puerto hacia `modules/alerts` para las alertas que abre/cierra la ingesta
 * (counter_reset, supply_non_genuine, device_still_reporting, EWS). El
 * adapter llama la fachada de ese módulo, que aplica el gate de
 * monitor_state/registration_state.
 */
export interface AlertNotifier {
  open(params: { deviceId: string; type: string; severity: "warning" | "critical"; message: string; value?: number | null; origin?: "cloud" | "device" }): Promise<void>;
  resolve(params: { deviceId: string; type: string }): Promise<void>;
  resolveStaleDeviceAlerts(params: { deviceId: string; currentTypes: string[] }): Promise<void>;
  synthesizeEwsAlertType(code: string | undefined | null, message: string): string;
}
