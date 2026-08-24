import { Queue } from "bullmq";
import Redis from "ioredis";
import { logger } from "../../../../logger";
import type { ReportDeliveryEnqueuer } from "../../application/ports/report-delivery-enqueuer";

/**
 * Conexión y cola propias para encolar la entrega — mismo criterio que
 * `modules/alerts` y `jobs/notificationWorker.ts`: lazy, no compartida con el
 * resto de la app. Singleton por proceso.
 */
let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) {
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
    queue = new Queue("report-delivery-queue", { connection: redis as any });
  }
  return queue;
}

export class BullmqReportDeliveryEnqueuer implements ReportDeliveryEnqueuer {
  async enqueueReportClosed(closureId: string): Promise<void> {
    try {
      await getQueue().add(
        "report.closed",
        { closureId },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      );
    } catch (err) {
      // Best-effort: una entrega perdida no debe tumbar el cierre en sí, que ya
      // commiteó correctamente.
      logger.error({ err }, "[reportService] No se pudo encolar la entrega del cierre");
    }
  }
}
