import type { Knex } from "knex";
import type { AlertClass } from "./domain/entities/alert";
import type { AlertScope } from "./domain/repositories/alert-repository";
import type { OpenAlertInput, OpenAlertResult, ResolveAlertInput, ResolveStaleDeviceAlertsInput } from "./application/dtos/alert-dtos";
import { OpenAlertUseCase } from "./application/use-cases/open-alert";
import { ResolveAlertUseCase, ResolveStaleDeviceAlertsUseCase } from "./application/use-cases/resolve-alerts";
import { KnexAlertRepository } from "./infrastructure/database/knex-alert-repository";
import { BullmqNotificationEnqueuer } from "./infrastructure/queue/bullmq-notification-enqueuer";

/**
 * Fachada del módulo para los consumidores que viven fuera de él y escriben
 * alertas con un `db`/`trx` a mano (`jobs/alertWorker.ts`,
 * `jobs/heartbeatMonitor.ts`, `services/agentService/sync-reading-alerts.ts`)
 * — mismas firmas que tenía `services/alertService.ts`, así los call-sites
 * sólo cambian el path del import. Mismo criterio que `modules/inventory/
 * index.ts::validateAndMerge`.
 */

export type { AlertClass, AlertClassification, AlertOrigin, AlertSeverity, Responder } from "./domain/entities/alert";
export { ALERT_CLASS_LABELS, RESPONDER_LABELS } from "./domain/entities/alert";
export { classifyAlert } from "./domain/services/alert-catalog";
export { synthesizeEwsAlertType } from "./domain/services/ews-alert-type";
export type { OpenAlertInput as OpenAlertParams, OpenAlertResult } from "./application/dtos/alert-dtos";

const notifications = new BullmqNotificationEnqueuer();

export function openAlert(db: Knex | Knex.Transaction, params: OpenAlertInput): Promise<OpenAlertResult> {
  return new OpenAlertUseCase(new KnexAlertRepository(db), notifications).execute(params);
}

export function resolveAlert(db: Knex | Knex.Transaction, params: ResolveAlertInput): Promise<number> {
  return new ResolveAlertUseCase(new KnexAlertRepository(db)).execute(params);
}

export function resolveStaleDeviceAlerts(db: Knex | Knex.Transaction, params: ResolveStaleDeviceAlertsInput): Promise<number> {
  return new ResolveStaleDeviceAlertsUseCase(new KnexAlertRepository(db)).execute(params);
}

/** Desglose de alertas ACTIVAS por clase para el dashboard, con el mismo scope/join que `GET /alerts/summary`. */
export function countOpenAlertsByClass(
  db: Knex,
  scope: AlertScope
): Promise<Array<{ alertClass: AlertClass | null; count: number }>> {
  return new KnexAlertRepository(db).countByClass(scope, { resolved: "false" });
}
