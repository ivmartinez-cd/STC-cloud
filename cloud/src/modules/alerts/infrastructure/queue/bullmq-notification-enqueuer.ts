import { Queue } from "bullmq";
import Redis from "ioredis";
import { logger } from "../../../../logger";
import type { NotificationEnqueuer } from "../../application/ports/notification-enqueuer";

/**
 * Conexión y cola propias para encolar notificaciones — mismo criterio que
 * `alertWorker.ts`/`heartbeatMonitor.ts`: cada job/servicio arma su propia
 * conexión en vez de compartir una global (ver `jobs/notificationWorker.ts`,
 * que es quien realmente procesa esta cola). Lazy: sólo se conecta la primera
 * vez que de verdad hace falta encolar algo. Singleton por proceso — igual que
 * la variable de módulo que reemplaza.
 */
let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) {
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
    queue = new Queue("notifications-queue", { connection: redis as any });
  }
  return queue;
}

export class BullmqNotificationEnqueuer implements NotificationEnqueuer {
  async enqueueAlertCreated(alertId: number): Promise<void> {
    try {
      await getQueue().add(
        "alert.created",
        { alertId },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      );
    } catch (err) {
      // Best-effort: una notificación perdida no debe tumbar la ingesta de la
      // alerta en sí, que ya se insertó correctamente.
      logger.error({ err }, "[alertService] No se pudo encolar la notificación");
    }
  }
}
