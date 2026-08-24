import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import { sendAlertEmail, sendAlertWebhook, sendIncidentEmail, sendIncidentWebhook, sendSupplyRequestEmail } from '../services/notificationService';
import { sendPublicApiWebhook } from '../services/publicWebhookService';
import { renderFor } from '../modules/message-templates/application/resolve-template';
import { eventEnabledFor } from '../modules/message-templates/domain/entities/message-template';
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
  notification_events: unknown;
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
      'clients.notification_email', 'clients.notification_webhook_url', 'clients.notification_events'
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
  // Fase 4.3: opt-out por evento + plantilla editable (default = texto histórico).
  const alertEnabled = eventEnabledFor(alert.notification_events, 'alert.created');
  const alertContent = alertEnabled
    ? await renderFor(db, alert.client_id, 'alert.created', {
        client_name: payload.clientName, target: payload.deviceName || payload.agentName,
        type: payload.type, message: payload.message, severity: payload.severity,
      })
    : null;
  const results = await Promise.allSettled([
    alertEnabled ? sendAlertEmail(payload, alert.notification_email, alertContent!, { db, clientId: alert.client_id, event: 'alert.created', metadata: { alert_id: alert.id, type: alert.type } }) : Promise.resolve(),
    alertEnabled && alert.notification_webhook_url ? sendAlertWebhook(payload, alert.notification_webhook_url) : Promise.resolve(),
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

/**
 * Fase 11 del gap analysis vs HP SDS — `incidentWorker.ts` encola en esta
 * MISMA cola (mismo criterio de "no inventar transporte nuevo"). Antes de
 * esta pasada el processor no miraba `job.name` — asumía que todo job era
 * `alertId` — así que un job de incidente hubiera desestructurado
 * `undefined` y buscado una alerta inexistente en silencio. Se corrige acá,
 * en el único lugar que lee la cola.
 */
async function processIncidentNotification(incidentId: string): Promise<void> {
  const incident = await db('incidents')
    .leftJoin('clients', 'clients.id', 'incidents.client_id')
    .leftJoin('devices', 'devices.id', 'incidents.device_id')
    .where('incidents.id', incidentId)
    .select(
      'incidents.id', 'incidents.number', 'incidents.class', 'incidents.title', 'incidents.severity', 'incidents.status',
      'clients.id as client_id', 'clients.name as client_name',
      'clients.notification_email', 'clients.notification_webhook_url', 'clients.notification_events',
      'devices.name_reported as device_label'
    )
    .first();

  if (!incident) {
    logger.warn(`[NotificationWorker] Incidente ${incidentId} no encontrado, se omite`);
    return;
  }
  if (incident.status === 'closed' || !incident.client_id) return;

  const payload = {
    incidentId: incident.id, number: Number(incident.number), klass: incident.class, title: incident.title,
    severity: incident.severity, clientId: incident.client_id, clientName: incident.client_name || 'Cliente',
    deviceLabel: incident.device_label ?? null,
  };

  const incidentEnabled = eventEnabledFor(incident.notification_events, 'incident.created');
  const incidentContent = incidentEnabled
    ? await renderFor(db, incident.client_id, 'incident.created', {
        client_name: payload.clientName, number: payload.number, title: payload.title,
        class: payload.klass, severity: payload.severity, device_label: payload.deviceLabel,
      })
    : null;
  const results = await Promise.allSettled([
    incidentEnabled ? sendIncidentEmail(payload, incident.notification_email, incidentContent!, { db, clientId: incident.client_id, event: 'incident.created', metadata: { incident_id: incident.id, number: Number(incident.number) } }) : Promise.resolve(),
    incidentEnabled && incident.notification_webhook_url ? sendIncidentWebhook(payload, incident.notification_webhook_url) : Promise.resolve(),
    sendPublicApiWebhook(db, incident.client_id, 'incident.created', {
      id: incident.id, number: Number(incident.number), class: incident.class, title: incident.title, severity: incident.severity,
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error({ err: r.reason }, `[NotificationWorker] Error enviando notificación de incidente ${incidentId}`);
    }
  }
}

export 
async function processSupplyRequestNotification(requestId: string, completed: boolean): Promise<void> {
  const request = await db('supply_requests')
    .leftJoin('clients', 'clients.id', 'supply_requests.client_id')
    .where('supply_requests.id', requestId)
    .select(
      'supply_requests.id', 'supply_requests.client_id', 'supply_requests.device_serial',
      'supply_requests.supply_kind', 'supply_requests.supply_color', 'supply_requests.description',
      'supply_requests.sku', 'supply_requests.level_pct',
      'clients.name as client_name', 'clients.notification_email', 'clients.notification_events'
    )
    .first();
  if (!request || !request.client_id) {
    logger.warn(`[NotificationWorker] Pedido ${requestId} no encontrado, se omite`);
    return;
  }
  const event = completed ? 'supply_request.completed' : 'supply_request.created';
  const supplyEnabled = eventEnabledFor(request.notification_events, event);
  const supplyContent = supplyEnabled
    ? await renderFor(db, request.client_id, event, {
        client_name: request.client_name || 'Cliente', device_serial: request.device_serial,
        supply: request.description ?? `${request.supply_kind} ${request.supply_color ?? ''}`,
        level_pct: request.level_pct != null ? `${request.level_pct}%` : null,
      })
    : null;
  const results = await Promise.allSettled([
    supplyEnabled ? sendSupplyRequestEmail({
      requestId: request.id, clientName: request.client_name || 'Cliente',
      deviceSerial: request.device_serial, supplyKind: request.supply_kind,
      supplyColor: request.supply_color, description: request.description,
      levelPct: request.level_pct, completed,
    }, request.notification_email, supplyContent!, { db, clientId: request.client_id, event, metadata: { request_id: request.id } }) : Promise.resolve(),
    sendPublicApiWebhook(db, request.client_id, event, {
      id: request.id, device_serial: request.device_serial, supply_kind: request.supply_kind,
      supply_color: request.supply_color, description: request.description,
      sku: request.sku, level_pct: request.level_pct,
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error({ err: r.reason }, `[NotificationWorker] Error notificando pedido ${requestId}`);
    }
  }
}

const notificationWorker = new Worker(
  'notifications-queue',
  async (job) => {
    if (job.name === 'incident.created') {
      const { incidentId } = job.data as { incidentId: string };
      await processIncidentNotification(incidentId);
      return;
    }
    if (job.name === 'supply_request.created' || job.name === 'supply_request.completed') {
      const { requestId } = job.data as { requestId: string };
      await processSupplyRequestNotification(requestId, job.name === 'supply_request.completed');
      return;
    }
    const { alertId } = job.data as { alertId: number };
    await processAlertNotification(alertId);
  },
  { connection: redis as any },
);

notificationWorker.on('failed', (job, err) => {
  logger.error({ err: err.message }, `[NotificationWorker] Job ${job?.id} falló`);
});

logger.info('[NotificationWorker] Iniciado — notificaciones de alertas críticas');
