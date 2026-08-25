import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import { sendPublicApiWebhook } from '../services/publicWebhookService';
import { logger } from '../logger';

/**
 * Procesa `public-api-readings-queue` (encolada desde `agentService.syncReadings`,
 * una vez por batch de sync — no una vez por lectura, para no saturar de POSTs
 * a un ERP). Agrupa las lecturas del batch por `client_id` (join a `devices`,
 * un batch de un agente puede tener equipos de un solo cliente en la práctica,
 * pero se agrupa igual por robustez) y dispara UN webhook por cliente con el
 * array de lecturas nuevas de ESE cliente.
 */

/**
 * Bug real (25/08/2026, mismo hallazgo que `notificationWorker.ts`):
 * `Promise.allSettled` + loguear nunca relanzaba, así que el `{attempts:3,
 * backoff:...}` que ya trae el enqueuer (`bullmq-ingest-queues.ts`) nunca se
 * activaba — una entrega fallida a un cliente quedaba perdida para siempre.
 * Trade-off aceptado al re-lanzar: un reintento puede reenviar a un cliente
 * cuyo webhook ya había tenido éxito en el intento anterior (no hay
 * tracking por cliente dentro del batch) — mejor una notificación
 * duplicada que una perdida.
 */
function throwIfAnyRejected(results: PromiseSettledResult<unknown>[]): void {
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  for (const r of rejected) logger.error({ err: r.reason }, '[PublicWebhookWorker] Error enviando webhook de lecturas');
  if (rejected.length > 0) {
    throw new Error(`${rejected.length}/${results.length} webhook(s) de lecturas fallaron`);
  }
}

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return 10000;
  },
});

interface InsertedReading {
  device_id: string;
  time: string | Date;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
}

async function processPublicReadingsNotification(readings: InsertedReading[]): Promise<void> {
  if (readings.length === 0) return;

  const deviceIds = [...new Set(readings.map((r) => r.device_id))];
  const devices = await db('devices').whereIn('id', deviceIds).select('id', 'client_id');
  const clientIdByDevice = new Map(devices.map((d) => [d.id, d.client_id]));

  const readingsByClient = new Map<string, InsertedReading[]>();
  for (const r of readings) {
    const clientId = clientIdByDevice.get(r.device_id);
    if (!clientId) continue; // dispositivo borrado entre el insert y este job — se omite
    if (!readingsByClient.has(clientId)) readingsByClient.set(clientId, []);
    readingsByClient.get(clientId)!.push(r);
  }

  const results = await Promise.allSettled(
    [...readingsByClient.entries()].map(([clientId, clientReadings]) =>
      sendPublicApiWebhook(db, clientId, 'reading.created', { readings: clientReadings })
    )
  );
  throwIfAnyRejected(results);
}

export const publicWebhookWorker = new Worker(
  'public-api-readings-queue',
  async (job) => {
    await processPublicReadingsNotification(job.data.readings);
  },
  { connection: redis as any }
);

publicWebhookWorker.on('failed', (job, err) => {
  logger.error({ err }, `[PublicWebhookWorker] Job ${job?.id} falló`);
});

logger.info('[PublicWebhookWorker] Iniciado — webhooks de lecturas de la API pública');
