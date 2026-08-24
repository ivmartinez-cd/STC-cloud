/**
 * Encola el aviso `alert.created` que procesa `jobs/notificationWorker.ts`.
 * Best-effort por contrato: una notificación perdida no debe tumbar la ingesta
 * de la alerta en sí (ya insertada) — el adapter absorbe y loguea el error,
 * nunca lo propaga.
 */
export interface NotificationEnqueuer {
  enqueueAlertCreated(alertId: number): Promise<void>;
}
