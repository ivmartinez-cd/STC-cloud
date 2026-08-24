import type { InsertedReadingRow, MappedReading } from "../../domain/entities/agent";

/**
 * Colas de post-ingesta (BullMQ): evaluación de alertas por lectura y webhook
 * `reading.created` de la API pública (un job por LOTE con las filas
 * realmente insertadas). Best-effort por contrato: el adapter loguea y no
 * propaga — una cola caída no debe tumbar la ingesta.
 */
export interface IngestQueues {
  enqueueAlertEvaluation(readings: MappedReading[]): Promise<void>;
  enqueueReadingWebhook(inserted: InsertedReadingRow[]): Promise<void>;
}
