import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import { sendReportEmail, sendReportWebhook } from '../services/notificationService';
import { sendPublicApiWebhook } from '../services/publicWebhookService';
import { buildClosureCsv, buildClosureXlsx } from '../services/reportExportService';
import { formatPeriod } from '../services/reportService';

/**
 * Procesa la cola `report-delivery-queue` (encolada desde `reportService.closePeriod`,
 * al confirmar la transacción de un cierre). Cola/worker PROPIOS — no se reusa
 * `notifications-queue`: ese worker asume siempre `{alertId}` sin discriminar por
 * `job.name`, mezclar payloads ahí sería frágil. Mismo esqueleto que
 * `notificationWorker.ts` (conexión propia, relee por id, envía best-effort).
 */

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return 10000;
  },
});

interface ClosureRow {
  id: string;
  client_id: string;
  client_name: string | null;
  period: Date;
  status: string;
  closed_at: Date;
  total_pages: number;
  notification_email: string | null;
  notification_webhook_url: string | null;
}

async function processReportDelivery(closureId: string): Promise<void> {
  // Se relee por id en vez de confiar en el payload del job: para cuando el
  // worker la procesa, el cierre pudo haberse reabierto mientras esperaba en
  // cola — en ese caso no tiene sentido mandar un cierre que ya no es vigente.
  const closure = await db('report_closures')
    .join('clients', 'report_closures.client_id', 'clients.id')
    .where('report_closures.id', closureId)
    .select(
      'report_closures.id', 'report_closures.client_id', 'report_closures.period',
      'report_closures.status', 'report_closures.closed_at', 'report_closures.total_pages',
      'clients.name as client_name',
      'clients.notification_email', 'clients.notification_webhook_url'
    )
    .first() as ClosureRow | undefined;

  if (!closure) {
    console.warn(`[ReportDeliveryWorker] Cierre ${closureId} no encontrado, se omite`);
    return;
  }
  if (closure.status !== 'closed') {
    console.log(`[ReportDeliveryWorker] Cierre ${closureId} ya no está 'closed' (reabierto), se omite`);
    return;
  }
  // Nota: ya NO se corta acá si el cliente no tiene canales de notificación
  // interna configurados — `sendPublicApiWebhook` es un mecanismo aparte
  // (`api_webhooks`, integración ERP) que igual debe dispararse aunque el
  // cliente no tenga `notification_email`/`notification_webhook_url`.

  const period = formatPeriod(closure.period);
  const payload = {
    closureId: closure.id,
    period,
    clientId: closure.client_id,
    clientName: closure.client_name || 'Cliente',
    totalPages: Number(closure.total_pages),
  };

  // Email y webhook son independientes — que uno falle no debe impedir el otro.
  const results = await Promise.allSettled([
    (async () => {
      if (!closure.notification_email) return;
      const lines = await db('report_closure_lines').where({ closure_id: closure.id }).orderBy('device_serial').select('*');
      const csv = buildClosureCsv(closure, lines);
      const xlsx = await buildClosureXlsx(closure, lines);
      await sendReportEmail(payload, closure.notification_email, [
        { filename: `cierre_${period}.csv`, content: csv, contentType: 'text/csv' },
        { filename: `cierre_${period}.xlsx`, content: xlsx, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ]);
    })(),
    closure.notification_webhook_url ? sendReportWebhook(payload, closure.notification_webhook_url) : Promise.resolve(),
    sendPublicApiWebhook(db, closure.client_id, 'report.closed', {
      closure_id: closure.id, period, total_pages: Number(closure.total_pages),
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`[ReportDeliveryWorker] Error entregando cierre ${closureId}:`, r.reason);
    }
  }
}

export const reportDeliveryWorker = new Worker(
  'report-delivery-queue',
  async (job) => {
    const { closureId } = job.data as { closureId: string };
    await processReportDelivery(closureId);
  },
  { connection: redis as any },
);

reportDeliveryWorker.on('failed', (job, err) => {
  console.error(`[ReportDeliveryWorker] Job ${job?.id} falló:`, err.message);
});

console.log('[ReportDeliveryWorker] Iniciado — entrega automática de cierres mensuales');
