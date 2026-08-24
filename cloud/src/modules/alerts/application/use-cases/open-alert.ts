import type { AlertRepository, NewAlert } from "../../domain/repositories/alert-repository";
import { classifyAlert } from "../../domain/services/alert-catalog";
import { ALERT_TYPE_MAX_LEN, deviceAcceptsAlerts } from "../../domain/services/alert-rules";
import type { NotificationEnqueuer } from "../ports/notification-enqueuer";
import type { OpenAlertInput, OpenAlertResult } from "../dtos/alert-dtos";

/** `type` recortado al ancho de la columna + clasificación derivada de él (nunca del `type` sin recortar). */
function toNewAlert(input: OpenAlertInput): NewAlert {
  const type = input.type.slice(0, ALERT_TYPE_MAX_LEN);
  return {
    deviceId: input.deviceId ?? null,
    agentId: input.agentId ?? null,
    type,
    severity: input.severity,
    message: input.message,
    value: input.value ?? null,
    origin: input.origin ?? "cloud",
    classification: classifyAlert(type, input.message),
  };
}

/**
 * Fuente única para abrir alertas. Antes había 3 escritores independientes
 * (`jobs/alertWorker.ts` y dos bloques de `agentService`) con dos claves de
 * dedupe distintas — uno de ellos ya produjo duplicados reales en producción
 * (SELECT-then-INSERT sin índice único). Hoy la garantía la da la base:
 * `AlertRepository.insertIfNotOpen` hace `INSERT ... ON CONFLICT DO NOTHING`
 * contra los índices únicos parciales de la migración
 * `20260822010000_alerts_lifecycle_and_agent_scope.ts`.
 *
 * El chequeo de `monitor_state`/`registration_state` vive ACÁ, en la única
 * primitiva de escritura, así cubre `alertWorker`, `agentService` y
 * `heartbeatMonitor` de una sola vez. Ventana de carrera benigna: si el estado
 * cambia entre el SELECT y el INSERT es una toggle de operador en medio de una
 * sync — no una condición que haya que resolver con un lock.
 */
export class OpenAlertUseCase {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly notifications: NotificationEnqueuer
  ) {}

  async execute(input: OpenAlertInput): Promise<OpenAlertResult> {
    if (!input.deviceId && !input.agentId) {
      throw new Error("openAlert requiere deviceId o agentId");
    }
    if (input.deviceId && !(await this.deviceCanAlert(input.deviceId))) {
      return { created: false };
    }

    const id = await this.alerts.insertIfNotOpen(toNewAlert(input));
    if (id === null) return { created: false };

    // Notificar SÓLO en una inserción real (nunca en un hit de dedupe — si no,
    // cada sync mientras la alerta sigue abierta reenviaría el aviso) y sólo
    // para severidad crítica (deliberadamente NO device_offline ni toner_*_low
    // — ver heartbeatMonitor.ts). El disparo real ocurre en notificationWorker.
    if (input.severity === "critical") await this.notifications.enqueueAlertCreated(id);
    return { created: true, id };
  }

  /** Un equipo inexistente no bloquea la apertura (comportamiento histórico). */
  private async deviceCanAlert(deviceId: string): Promise<boolean> {
    const gate = await this.alerts.findDeviceGate(deviceId);
    return gate === null || deviceAcceptsAlerts(gate);
  }
}
