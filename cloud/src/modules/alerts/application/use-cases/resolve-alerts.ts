import type { AlertRepository } from "../../domain/repositories/alert-repository";
import type { ResolveAlertInput, ResolveStaleDeviceAlertsInput } from "../dtos/alert-dtos";

/** Resuelve (si estaba abierta) la alerta `(device_id|agent_id, type)` dada. Devuelve filas tocadas. */
export class ResolveAlertUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(input: ResolveAlertInput): Promise<number> {
    if (!input.deviceId && !input.agentId) {
      throw new Error("resolveAlert requiere deviceId o agentId");
    }
    return this.alerts.resolveOpen({ deviceId: input.deviceId, agentId: input.agentId }, input.type);
  }
}

/**
 * Resuelve las alertas de ORIGEN DISPOSITIVO (`origin='device'`) de un equipo que
 * estaban abiertas pero cuyo `type` ya no aparece en `currentTypes` de la
 * sincronización actual — el equipo dejó de reportarlas. Antes esto usaba una
 * blocklist (`NON_EWS_RESERVED_TYPES`) que asumía "todo lo que no sea un puñado
 * de tipos internos es EWS" — una negación abierta que cada tipo interno nuevo
 * volvía a romper (bug real: `device_error` y `device_still_reporting` no
 * estaban protegidos). Filtrar por `origin='device'` (positivo, no negativo)
 * cierra la CLASE de bug entera — ver migración
 * `20260824010000_alerts_classification_and_origin.ts`.
 */
export class ResolveStaleDeviceAlertsUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  execute(input: ResolveStaleDeviceAlertsInput): Promise<number> {
    return this.alerts.resolveStaleDeviceAlerts(input.deviceId, input.currentTypes);
  }
}
