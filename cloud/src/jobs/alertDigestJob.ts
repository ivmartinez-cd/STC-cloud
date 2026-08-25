import knex from 'knex';
import { runGuardedTick } from '../modules/observability/guarded-tick';
import knexConfig from '../db/knexfile';
import { sendMail } from '../services/notificationService';
import type { SendMailOptions } from '../services/notificationService';
import { renderFor } from '../modules/message-templates';
import { ALERT_CLASS_LABELS } from '../modules/alerts';
import { logger } from '../logger';

const db = knex(knexConfig.development);

/** Sólo para tests: cierra el pool propio del módulo (ver `src/tests/alertDigest.test.ts`,
 * que importa este archivo directamente contra Postgres real — sin esto el pool queda
 * abierto y `node --test` nunca termina el proceso por su cuenta). No lo usa nada más. */
export async function closeDb(): Promise<void> {
  await db.destroy();
}

/**
 * Digest diario de alertas — pendiente explícito de la Fase 1 del gap
 * analysis vs HP SDS ("Alert loop... ⬜ digest diario no implementado").
 * `setInterval` + advisory lock (`runGuardedTick`), mismo criterio que el
 * resto de los jobs de este archivo (`heartbeatMonitor.ts`, `retentionJob.ts`)
 * — no BullMQ repeatable, replica-safe con un lock barato.
 *
 * Opt-in por cliente vía `notification_events` (`"alert.digest"`) — no un
 * boolean paralelo, ver docblock de la migración `20260825010000`. Se manda
 * una sola vez por día LOCAL del cliente (TZ fija `America/Argentina/
 * Buenos_Aires`, mismo fallback que ya usa `Logger.ts`/`business_hours` —
 * unificar por TZ real del agente queda para la misma pasada de "cosmética
 * de locale" ya diferida en el gap analysis), a partir de `DIGEST_HOUR_LOCAL`.
 * `clients.last_alert_digest_sent_at` es la marca de idempotencia: sin ella,
 * un reinicio del proceso entre el envío y el próximo tick reenviaría el
 * mismo día.
 */
const TZ = 'America/Argentina/Buenos_Aires';
const DIGEST_HOUR_LOCAL = 7;
const CHECK_INTERVAL_MINUTES = 15;

export interface EligibleClient {
  id: string;
  name: string;
  notification_email: string;
}

interface SeverityCount {
  severity: 'critical' | 'warning';
  count: string;
}

interface ClassCount {
  alert_class: string | null;
  count: string;
}

/**
 * Mismo join que `notificationWorker.ts`/`alertWorker.ts` para resolver el
 * `client_id` de una alerta: `alerts` no lo tiene directo, se resuelve vía
 * `device_id` (equipo → agente → cliente) o, si es una alerta agent-scoped
 * sin equipo, vía `alerts.agent_id` directo (`COALESCE`).
 */
function alertsForClient(clientId: string) {
  return db('alerts')
    .leftJoin('devices', 'alerts.device_id', 'devices.id')
    .leftJoin('agents', 'agents.id', db.raw('COALESCE(devices.agent_id, alerts.agent_id)'))
    .where('agents.client_id', clientId);
}

export async function findEligibleClients(): Promise<EligibleClient[]> {
  return db('clients')
    .whereRaw(`notification_events @> '["alert.digest"]'::jsonb`)
    .whereNotNull('notification_email')
    .whereRaw(`EXTRACT(HOUR FROM (now() AT TIME ZONE ?)) >= ?`, [TZ, DIGEST_HOUR_LOCAL])
    .whereRaw(
      `(last_alert_digest_sent_at IS NULL OR
        (last_alert_digest_sent_at AT TIME ZONE ?)::date < (now() AT TIME ZONE ?)::date)`,
      [TZ, TZ]
    )
    .select('id', 'name', 'notification_email');
}

export interface DigestStats {
  criticalCount: number;
  warningCount: number;
  opened24h: number;
  topClasses: string;
}

function formatTopClasses(classRows: ClassCount[]): string {
  return classRows
    .slice(0, 5)
    .map((r) => `${ALERT_CLASS_LABELS[r.alert_class as keyof typeof ALERT_CLASS_LABELS] ?? r.alert_class ?? 'Sin clasificar'} (${r.count})`)
    .join(', ') || 'ninguna';
}

function querySeverityCounts(clientId: string): Promise<SeverityCount[]> {
  return alertsForClient(clientId)
    .where('resolved', false)
    .groupBy('severity')
    .select('severity')
    .count('* as count') as Promise<SeverityCount[]>;
}

function queryClassCounts(clientId: string): Promise<ClassCount[]> {
  return alertsForClient(clientId)
    // Sin calificar, "created_at" es ambiguo: `devices` y `agents` (ambos
    // en el LEFT JOIN de `alertsForClient`) también tienen su propia
    // columna `created_at` — Postgres rechaza la query entera si no se
    // especifica de cuál tabla.
    .where('alerts.created_at', '>=', db.raw(`now() - interval '24 hours'`))
    .groupBy('alert_class')
    .select('alert_class')
    .count('* as count')
    .orderBy('count', 'desc') as unknown as Promise<ClassCount[]>;
}

export async function gatherDigestStats(clientId: string): Promise<DigestStats> {
  const [severityRows, classRows] = await Promise.all([
    querySeverityCounts(clientId),
    queryClassCounts(clientId),
  ]);

  return {
    criticalCount: Number(severityRows.find((r) => r.severity === 'critical')?.count ?? 0),
    warningCount: Number(severityRows.find((r) => r.severity === 'warning')?.count ?? 0),
    opened24h: classRows.reduce((sum, r) => sum + Number(r.count), 0),
    topClasses: formatTopClasses(classRows),
  };
}

type SendMailFn = (opts: SendMailOptions) => Promise<void>;

async function emailDigest(client: EligibleClient, stats: DigestStats, sendMailFn: SendMailFn): Promise<void> {
  const content = await renderFor(db, client.id, 'alert.digest', {
    client_name: client.name,
    critical_count: stats.criticalCount,
    warning_count: stats.warningCount,
    opened_24h: stats.opened24h,
    top_classes: stats.topClasses,
  });
  await sendMailFn({
    to: client.notification_email,
    subject: content.subject,
    text: content.body,
    audit: { db, clientId: client.id, event: 'alert.digest', metadata: { ...stats } },
  });
}

async function sendDigestFor(client: EligibleClient, sendMailFn: SendMailFn): Promise<void> {
  const stats = await gatherDigestStats(client.id);
  await emailDigest(client, stats, sendMailFn);
  await db('clients').where('id', client.id).update({ last_alert_digest_sent_at: db.fn.now() });
  logger.info(`[AlertDigestJob] Digest enviado a ${client.name} (${stats.criticalCount} crítica(s), ${stats.warningCount} advertencia(s), ${stats.opened24h} nueva(s) en 24h)`);
}

/**
 * `sendMailFn` es inyectable SÓLO para tests (`src/tests/alertDigest.test.ts`,
 * per-client isolation) — `sendMail` real de `notificationService` se exporta
 * como binding ESM en vivo (no configurable), así que no se puede parchear
 * desde afuera con `mock.method`/`Object.defineProperty` como con un objeto
 * común; inyectar la dependencia es más simple y explícito que pelear con
 * eso. `runAlertDigestChecks()` (el único llamador real) nunca pasa nada,
 * así que el comportamiento en producción es idéntico al de antes.
 */
export async function runDigestCheck(sendMailFn: SendMailFn = sendMail): Promise<void> {
  const clients = await findEligibleClients();
  for (const client of clients) {
    try {
      await sendDigestFor(client, sendMailFn);
    } catch (err: unknown) {
      // Best-effort por cliente — un fallo de un digest no debe impedir el
      // de los demás clientes elegibles en el mismo tick.
      logger.error({ err }, `[AlertDigestJob] Error armando/enviando digest para ${client.name}`);
    }
  }
}

export async function runAlertDigestChecks(): Promise<void> {
  await runGuardedTick(db, 'alert-digest', runDigestCheck);
}

/**
 * El auto-arranque (tick inmediato + `setInterval`) se salta cuando
 * `ALERT_DIGEST_JOB_AUTOSTART=0`. Lo usa únicamente
 * `src/tests/alertDigest.test.ts`, que importa este módulo para ejercitar
 * `findEligibleClients`/`gatherDigestStats`/`runDigestCheck` directamente
 * contra Postgres real: sin este guard, importarlo en un test dispararía un
 * tick real contra la base antes de que existan los fixtures Y dejaría un
 * `setInterval` colgado que nunca deja terminar al proceso de `node --test`.
 * `server.ts` (el único otro importador) nunca setea esta variable, así que
 * el comportamiento en producción/dev queda idéntico al de antes.
 */
if (process.env.ALERT_DIGEST_JOB_AUTOSTART !== '0') {
  runAlertDigestChecks();
  setInterval(runAlertDigestChecks, CHECK_INTERVAL_MINUTES * 60 * 1000);
  logger.info(`[AlertDigestJob] Iniciado — chequeo cada ${CHECK_INTERVAL_MINUTES} min, envío diario a partir de las ${DIGEST_HOUR_LOCAL}:00 (${TZ})`);
}
