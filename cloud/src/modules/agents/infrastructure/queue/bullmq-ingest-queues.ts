import { Queue } from "bullmq";
import { logger } from "../../../../logger";
import type { InsertedReadingRow, MappedReading, RedisClient } from "../../domain/entities/agent";
import type { IngestQueues } from "../../application/ports/ingest-queues";

/**
 * Misma forma que el original: se instancia la `Queue` por llamada sobre la
 * conexión Redis que recibe `AgentService` (parámetro `redis` del
 * constructor — históricamente opcional). Best-effort: BullMQ caído no
 * tumba la ingesta.
 */
export class BullmqIngestQueues implements IngestQueues {
  constructor(private readonly redis?: RedisClient) {}

  async enqueueAlertEvaluation(readings: MappedReading[]): Promise<void> {
    try {
      await new Queue("readings-queue", { connection: this.redis as any }).add("evaluate-readings", { readings });
    } catch (e: unknown) {
      logger.error({ err: e }, "[SYNC] BullMQ no disponible");
    }
  }

  // Webhook "reading.created" de la API pública — un job por LOTE con las filas realmente insertadas.
  // R9 gap analysis vs HP SDS ("falta expiración/retry automáticos"): igual
  // criterio que alert.created/report.closed/incident.created.
  async enqueueReadingWebhook(inserted: InsertedReadingRow[]): Promise<void> {
    if (inserted.length === 0) return;
    try {
      await new Queue("public-api-readings-queue", { connection: this.redis as any }).add(
        "notify-readings", { readings: inserted },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      );
    } catch (e: unknown) {
      logger.error({ err: e }, "[SYNC] BullMQ (public-api-readings-queue) no disponible");
    }
  }
}
