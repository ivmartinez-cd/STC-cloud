import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';

const db    = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

interface MappedReading {
  device_id: string;
  status: string;
}

async function openAlert(deviceId: string, type: string, severity: string, message: string, value: number) {
  const existing = await db('alerts')
    .where({ device_id: deviceId, type, resolved: false })
    .first();
  if (existing) return;
  await db('alerts').insert({ device_id: deviceId, type, severity, message, value });
  console.log(`[Alert] OPEN [${severity.toUpperCase()}] device=${deviceId} — ${message}`);
}

async function resolveAlerts(deviceId: string, type: string) {
  const updated = await db('alerts')
    .where({ device_id: deviceId, type, resolved: false })
    .update({ resolved: true, resolved_at: new Date() });
  if (updated > 0) {
    console.log(`[Alert] CLOSE type=${type} device=${deviceId}`);
  }
}

async function evaluateReading(r: MappedReading) {
  const errorStatuses = ['error', 'stopped', 'other'];
  if (r.status && errorStatuses.includes(r.status.toLowerCase())) {
    await openAlert(r.device_id, 'device_error', 'critical', `Error del dispositivo: ${r.status}`, 0);
  } else {
    await resolveAlerts(r.device_id, 'device_error');
  }
}

export const alertWorker = new Worker(
  'readings-queue',
  async (job) => {
    const readings: MappedReading[] = job.data.readings || [];
    await Promise.allSettled(readings.map(evaluateReading));
  },
  { connection: redis },
);

alertWorker.on('failed', (job, err) => {
  console.error(`[AlertWorker] Job ${job?.id} failed:`, err.message);
});

console.log('[AlertWorker] Iniciado — Sistema de Toma de Contadores');
