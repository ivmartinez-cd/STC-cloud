import { Queue } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import { logger } from '../logger';
import { runGuardedTick } from "../modules/observability/guarded-tick";

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy() { return 10000; },
});

// Cola compartida con `alertService.ts`/`notificationWorker.ts` a propósito
// (Fase 11 del gap analysis vs HP SDS): "sin inventar transporte nuevo". El
// worker despacha por `job.name` — antes sólo procesaba `alert.created`
// implícitamente (sin mirar el nombre); se corrigió ahí mismo para que
// convivan los dos tipos de job sin que uno rompa al otro.
const notificationsQueue = new Queue('notifications-queue', { connection: redis as any });

/**
 * Se queda como `setInterval` a propósito, mismo criterio que
 * `heartbeatMonitor.ts`/`retentionJob.ts` — un solo `api` service sin
 * réplicas en este entorno, no hace falta una cola para evitar doble-disparo.
 * 2 min: bastante rápido para que "delay_minutes: 0" (reglas sin anti-flapping)
 * abra un incidente casi en tiempo real, sin ser tan agresivo como para
 * competir en serio con el resto de los jobs por conexiones del pool.
 */
const INTERVAL_MINUTES = 2;

interface EligibleAlert {
  id: number;
  device_id: string;
  severity: string;
  type: string;
  message: string | null;
  value: number | null;
  client_id: string;
  agent_id: string | null;
  serial_number: string | null;
  name_reported: string | null;
  model: string | null;
}

interface Rule {
  id: string;
  client_id: string | null;
  class: string;
  min_severity: string;
  delay_minutes: number;
  sla_hours: number | null;
  auto_close_on_alerts_resolved: boolean;
}

/**
 * Alertas abiertas que matchean la regla y todavía no están vinculadas a un
 * incidente ABIERTO. Precedencia cliente > global: una regla GLOBAL
 * (`client_id IS NULL`) nunca aplica a un cliente que tenga su PROPIA fila
 * para esa clase (enabled o no — un override explícito, aunque esté
 * deshabilitado, es una decisión consciente que no debe pisarse con el
 * default).
 */
async function eligibleAlertsForRule(rule: Rule): Promise<EligibleAlert[]> {
  const severityCondition = rule.min_severity === 'critical'
    ? "alerts.severity = 'critical'"
    : "alerts.severity IN ('warning','critical')";

  return db('alerts')
    .join('devices', 'devices.id', 'alerts.device_id')
    .where('alerts.resolved', false)
    .where('alerts.alert_class', rule.class)
    .whereRaw(`alerts.created_at <= now() - (? || ' minutes')::interval`, [rule.delay_minutes])
    .whereRaw(severityCondition)
    .modify((q) => {
      if (rule.client_id) {
        q.andWhere('devices.client_id', rule.client_id);
      } else {
        q.whereNotIn('devices.client_id', db('incident_rules').where('class', rule.class).whereNotNull('client_id').select('client_id'));
      }
    })
    .whereNotExists(
      db('incident_alerts')
        .join('incidents', 'incidents.id', 'incident_alerts.incident_id')
        .whereRaw('incident_alerts.alert_id = alerts.id')
        .whereNot('incidents.status', 'closed')
    )
    .select(
      'alerts.id', 'alerts.device_id', 'alerts.severity', 'alerts.type', 'alerts.message', 'alerts.value',
      'devices.client_id', 'devices.agent_id', 'devices.serial_number', 'devices.name_reported', 'devices.model'
    );
}

async function openOrLinkIncident(rule: Rule, alert: EligibleAlert): Promise<{ incidentId: string; created: boolean }> {
  const label = alert.name_reported || alert.model || null;
  const title = `${rule.class} — ${label || alert.serial_number || 'equipo'}`.slice(0, 200);

  // Mismo patrón que `alertService.openAlert` — conflict target crudo porque
  // apunta a un índice PARCIAL (`incidents_open_device_class_uniq`), que la
  // forma de array de knex sólo puede expresar si es total.
  const conflictTarget = db.raw("(device_id, class) WHERE status <> 'closed' AND device_id IS NOT NULL AND origin = 'auto'");
  const rows = await db('incidents')
    .insert({
      client_id: alert.client_id,
      device_id: alert.device_id,
      agent_id: alert.agent_id,
      device_serial: alert.serial_number,
      device_label: label,
      class: rule.class,
      title,
      severity: alert.severity === 'critical' ? 'critical' : 'warning',
      origin: 'auto',
      sla_due_at: rule.sla_hours ? db.raw(`now() + (? || ' hours')::interval`, [rule.sla_hours]) : null,
    })
    .onConflict(conflictTarget)
    .ignore()
    .returning('id');

  if (rows.length > 0) {
    const incidentId = rows[0].id as string;
    await db('incident_events').insert({
      incident_id: incidentId, kind: 'status_change',
      body: `Incidente automático abierto por la alerta #${alert.id} (${alert.type})`,
    });
    return { incidentId, created: true };
  }

  const existing = await db('incidents')
    .where({ device_id: alert.device_id, class: rule.class, origin: 'auto' })
    .whereNot('status', 'closed')
    .select('id')
    .first();
  if (!existing) {
    // Ventana de carrera improbable (el incidente se cerró entre el INSERT
    // fallido y este SELECT) — se reintenta el próximo tick, no hace falta
    // resolverlo en la misma pasada.
    throw new Error(`No se encontró el incidente abierto esperado para device=${alert.device_id} class=${rule.class}`);
  }
  return { incidentId: existing.id as string, created: false };
}

async function processRule(rule: Rule): Promise<void> {
  const alerts = await eligibleAlertsForRule(rule);
  for (const alert of alerts) {
    try {
      const { incidentId, created } = await openOrLinkIncident(rule, alert);
      await db('incident_alerts').insert({ incident_id: incidentId, alert_id: alert.id })
        .onConflict(['incident_id', 'alert_id']).ignore();
      if (!created) {
        await db('incident_events').insert({
          incident_id: incidentId, kind: 'link_alert',
          body: `Alerta #${alert.id} (${alert.type}) agrupada en el incidente existente`,
          metadata: JSON.stringify({ alert_id: alert.id }),
        });
      } else {
        logger.info(`[IncidentWorker] Incidente automático abierto: device=${alert.device_id} class=${rule.class} alert=${alert.id}`);
        await notifyIncidentCreated(incidentId);
      }
    } catch (err: unknown) {
      logger.error({ err }, `[IncidentWorker] Error procesando alerta ${alert.id} para la regla ${rule.id}`);
    }
  }
}

/**
 * Sólo encola — el envío real (email/webhook del cliente + webhook de
 * integración ERP) vive en `notificationWorker.ts`, igual que para alertas:
 * no bloquear este tick con SMTP/fetch mientras el resto de las reglas
 * todavía tienen alertas por procesar.
 */
async function notifyIncidentCreated(incidentId: string): Promise<void> {
  try {
    await notificationsQueue.add('incident.created', { incidentId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  } catch (err) {
    logger.error({ err }, '[IncidentWorker] No se pudo encolar la notificación de incidente');
  }
}

/** Cierra incidentes `auto` cuya regla pide `auto_close_on_alerts_resolved` y cuyas alertas vinculadas ya resolvieron todas. */
async function autoCloseResolved(rule: Rule): Promise<void> {
  if (!rule.auto_close_on_alerts_resolved) return;
  const openIncidents = await db('incidents')
    .modify((q) => { if (rule.client_id) q.andWhere('client_id', rule.client_id); })
    .where({ class: rule.class, origin: 'auto' })
    .whereNot('status', 'closed')
    .select('id');

  for (const inc of openIncidents) {
    const stillOpen = await db('incident_alerts')
      .join('alerts', 'alerts.id', 'incident_alerts.alert_id')
      .where('incident_alerts.incident_id', inc.id)
      .where('alerts.resolved', false)
      .first();
    if (stillOpen) continue;

    await db('incidents').where({ id: inc.id }).update({ status: 'closed', closed_at: new Date(), close_reason: 'Auto-cierre: todas las alertas vinculadas se resolvieron', updated_at: new Date() });
    await db('incident_events').insert({ incident_id: inc.id, kind: 'status_change', body: 'Auto-cierre: todas las alertas vinculadas se resolvieron' });
    logger.info(`[IncidentWorker] Incidente ${inc.id} auto-cerrado (todas sus alertas resolvieron)`);
  }
}

async function tick(): Promise<void> {
  // Lock multi-réplica + métricas + Sentry — Fase 5.3 (el catch vive en el wrapper).
  await runGuardedTick(db, "incidents", async () => {
    const rules = await db('incident_rules').where('enabled', true).select('*') as Rule[];
    for (const rule of rules) {
      await processRule(rule);
      await autoCloseResolved(rule);
    }
  });
}

tick();
setInterval(tick, INTERVAL_MINUTES * 60 * 1000);

logger.info(`[IncidentWorker] Iniciado — cada ${INTERVAL_MINUTES} min, opt-in por regla (incident_rules.enabled)`);
