import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import { sendPublicApiWebhook } from '../services/publicWebhookService';

/**
 * Procesa `public-api-readings-queue` (encolada desde `agentService.syncReadings`,
 * una vez por batch de sync — no una vez por lectura, para no saturar de POSTs
 * a un ERP). Agrupa las lecturas del batch por `client_id` (join a `devices`,
 * un batch de un agente puede tener equipos de un solo cliente en la práctica,
 * pero se agrupa igual por robustez) y dispara UN webhook por cliente con el
 * array de lecturas nuevas de ESE cliente.
 */

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
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[PublicWebhookWorker] Error enviando webhook de lecturas:', r.reason);
    }
  }
}

export const publicWebhookWorker = new Worker(
  'public-api-readings-queue',
  async (job) => {
    await processPublicReadingsNotification(job.data.readings);
  },
  { connection: redis as any }
);

publicWebhookWorker.on('failed', (job, err) => {
  console.error(`[PublicWebhookWorker] Job ${job?.id} falló:`, err);
});

console.log('[PublicWebhookWorker] Iniciado — webhooks de lecturas de la API pública');
