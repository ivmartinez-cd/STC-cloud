import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import { sendAlertEmail, sendAlertWebhook } from '../services/notificationService';
import { sendPublicApiWebhook } from '../services/publicWebhookService';
import { logger } from '../logger';

/**
 * Procesa la cola `notifications-queue` (encolada desde `alertService.openAlert`,
 * sólo para alertas nuevas de severidad crítica). Deliberadamente separado del
 * envío en sí: si se llamara a `sendMail`/`fetch` en línea desde donde se abre la
 * alerta, una demora de SMTP/webhook bloquearía la ingesta de lecturas
 * (`agentService.syncReadings` puede abrir esto hasta 50 veces en un solo request
 * de un agente) o arriesgaría superar el lock de `alertWorker.ts` y hacer que
 * BullMQ reintente ese job entero.
 */

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return 10000;
  },
});

interface AlertRow {
  id: number;
  type: string;
  severity: string;
  message: string;
  resolved: boolean;
  device_name: string | null;
  device_decommissioned_at: Date | null;
  agent_name: string | null;
  client_id: string | null;
  client_name: string | null;
  notification_email: string | null;
  notification_webhook_url: string | null;
}

async function processAlertNotification(alertId: number): Promise<void> {
  // Se relee por id en vez de confiar en el payload del job: para cuando el
  // worker la procesa, la alerta pudo haberse resuelto/reconocido mientras
  // esperaba en cola — en ese caso ya no hace falta avisar.
  const alert = await db('alerts')
    .leftJoin('devices', 'alerts.device_id', 'devices.id')
    .leftJoin('agents', 'agents.id', db.raw('COALESCE(devices.agent_id, alerts.agent_id)'))
    .leftJoin('clients', 'agents.client_id', 'clients.id')
    .where('alerts.id', alertId)
    .select(
      'alerts.id', 'alerts.type', 'alerts.severity', 'alerts.message', 'alerts.resolved',
      'devices.name as device_name', 'devices.decommissioned_at as device_decommissioned_at',
      'agents.name as agent_name',
      'clients.id as client_id', 'clients.name as client_name',
      'clients.notification_email', 'clients.notification_webhook_url'
    )
    .first() as AlertRow | undefined;

  if (!alert) {
    logger.warn(`[NotificationWorker] Alerta ${alertId} no encontrada, se omite`);
    return;
  }
  if (alert.resolved) {
    logger.info(`[NotificationWorker] Alerta ${alertId} ya resuelta antes de notificar, se omite`);
    return;
  }
  if (alert.device_decommissioned_at) {
    // El equipo se dio de baja mientras el job esperaba en cola — la
    // transacción de baja ya resolvió sus alertas, pero esto cubre el job
    // que ya estaba encolado justo antes.
    logger.info(`[NotificationWorker] Alerta ${alertId} es de un equipo dado de baja, se omite`);
    return;
  }
  if (!alert.client_id) {
    // Alerta huérfana (dispositivo/agente sin cliente asociado) — no hay a quién avisar.
    return;
  }

  const payload = {
    alertId: alert.id,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    deviceName: alert.device_name,
    agentName: alert.agent_name,
    clientId: alert.client_id,
    clientName: alert.client_name || 'Cliente',
  };

  // Email, webhook de notificación interna, y webhook de la API pública
  // (integración ERP, distinto mecanismo — `api_webhooks` por cliente, no
  // `clients.notification_webhook_url`) son independientes entre sí.
  const results = await Promise.allSettled([
    sendAlertEmail(payload, alert.notification_email),
    alert.notification_webhook_url ? sendAlertWebhook(payload, alert.notification_webhook_url) : Promise.resolve(),
    sendPublicApiWebhook(db, alert.client_id, 'alert.created', {
      id: alert.id, type: alert.type, severity: alert.severity, message: alert.message,
      device_name: alert.device_name, agent_name: alert.agent_name,
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error({ err: r.reason }, `[NotificationWorker] Error enviando notificación de alerta ${alertId}`);
    }
  }
}

export const notificationWorker = new Worker(
  'notifications-queue',
  async (job) => {
    const { alertId } = job.data as { alertId: number };
    await processAlertNotification(alertId);
  },
  { connection: redis as any },
);

notificationWorker.on('failed', (job, err) => {
  logger.error({ err: err.message }, `[NotificationWorker] Job ${job?.id} falló`);
});

logger.info('[NotificationWorker] Iniciado — notificaciones de alertas críticas');
