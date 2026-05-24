import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';

const db    = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Retry every 10 seconds to avoid CPU/event loop spam
    return 10000;
  }
});

interface MappedReading {
  device_id: string;
  total_pages?: number | null;
  mono_pages?: number | null;
  color_pages?: number | null;
  toner_black?: number | null;
  toner_cyan?: number | null;
  toner_magenta?: number | null;
  toner_yellow?: number | null;
  offline?: boolean;
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
  // 1. Manejo del estado offline del dispositivo
  if (r.offline) {
    await openAlert(r.device_id, 'device_error', 'critical', 'Dispositivo fuera de línea (sin respuesta)', 0);
  } else {
    await resolveAlerts(r.device_id, 'device_error');
  }

  // 2. Obtener umbrales dinámicos de la base de datos de acuerdo al agente asociado al dispositivo
  const device = await db('devices')
    .join('agents', 'devices.agent_id', 'agents.id')
    .where('devices.id', r.device_id)
    .select(
      'devices.name as device_name',
      'agents.toner_warning_threshold',
      'agents.toner_critical_threshold'
    )
    .first();

  const warningThreshold = device?.toner_warning_threshold ?? 20;
  const criticalThreshold = device?.toner_critical_threshold ?? 10;
  const deviceName = device?.device_name || 'Dispositivo';

  // 3. Evaluar los 4 colores de tóner
  const colors = ['black', 'cyan', 'magenta', 'yellow'];
  for (const color of colors) {
    const val = r[`toner_${color}` as keyof MappedReading];
    if (typeof val === 'number' && val >= 0) {
      const lowType = `toner_${color}_low`;
      const critType = `toner_${color}_critical`;

      if (val <= criticalThreshold) {
        // Tóner <= Umbral Crítico: Abre toner_<color>_critical y cierra toner_<color>_low
        await openAlert(
          r.device_id,
          critType,
          'critical',
          `Tóner ${color.toUpperCase()} en nivel crítico (${val}%)`,
          val
        );
        await resolveAlerts(r.device_id, lowType);
      } else if (val <= warningThreshold) {
        // Umbral Crítico < Tóner <= Umbral Warning: Abre toner_<color>_low y cierra toner_<color>_critical
        await openAlert(
          r.device_id,
          lowType,
          'warning',
          `Tóner ${color.toUpperCase()} bajo (${val}%)`,
          val
        );
        await resolveAlerts(r.device_id, critType);
      } else {
        // Tóner > Umbral Warning: Cierra ambas alertas de ese color
        await resolveAlerts(r.device_id, lowType);
        await resolveAlerts(r.device_id, critType);
      }
    }
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

