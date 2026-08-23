import knex from 'knex';
import knexConfig from '../db/knexfile';
import { logger } from '../logger';

const db = knex(knexConfig.development);

const AGENT_LOGS_RETENTION_DAYS = 90; // sólo diagnóstico operacional, purga agresiva
const RESOLVED_ALERTS_RETENTION_MONTHS = 12; // historial razonable; abiertas NUNCA se purgan

/**
 * Se queda como `setInterval` a propósito, mismo criterio que
 * `heartbeatMonitor.ts`: la base productiva usa Redis con `maxmemoryPolicy:
 * allkeys-lru` (BullMQ repeatable jobs fallarían en silencio si Redis
 * desaloja su estado) y prod corre sobre Neon gestionado, donde no se puede
 * asumir que `pg_cron` esté disponible ni gestionar `shared_preload_libraries`.
 * No necesita la cadencia del heartbeat (2 min) — es housekeeping, corre cada
 * `INTERVAL_HOURS`.
 *
 * `readings` NO se purga acá — usa `add_retention_policy` nativo de
 * TimescaleDB (ver migración `20260823030000_readings_retention_policy.ts`),
 * que ya corre como job interno de la extensión. `audit_logs` queda sin
 * purga (trail de auditoría, decisión de negocio explícita).
 *
 * Los DELETE de este job NO son reversibles — a diferencia de las
 * migraciones "guardadas" del proyecto, que chequean antes de actuar pero
 * nunca borran datos, esto sí borra filas de forma permanente cada corrida.
 */
const INTERVAL_HOURS = 6;

async function purgeOldAgentLogs() {
  try {
    const deleted = await db('agent_logs')
      .where('timestamp', '<', db.raw(`now() - interval '${AGENT_LOGS_RETENTION_DAYS} days'`))
      .del();
    if (deleted > 0) {
      logger.info(`[RetentionJob] ${deleted} fila(s) de agent_logs purgadas (> ${AGENT_LOGS_RETENTION_DAYS} días)`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, '[RetentionJob] Error purgando agent_logs');
  }
}

async function purgeResolvedAlerts() {
  try {
    const deleted = await db('alerts')
      .where('resolved', true)
      .where('resolved_at', '<', db.raw(`now() - interval '${RESOLVED_ALERTS_RETENTION_MONTHS} months'`))
      .del();
    if (deleted > 0) {
      logger.info(`[RetentionJob] ${deleted} alerta(s) resuelta(s) purgadas (> ${RESOLVED_ALERTS_RETENTION_MONTHS} meses)`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, '[RetentionJob] Error purgando alerts resueltas');
  }
}

export async function runRetentionChecks() {
  await purgeOldAgentLogs();
  await purgeResolvedAlerts();
}

// Ejecutar al arrancar y luego cada INTERVAL_HOURS horas
runRetentionChecks();
setInterval(runRetentionChecks, INTERVAL_HOURS * 60 * 60 * 1000);

logger.info(`[RetentionJob] Iniciado — agent_logs > ${AGENT_LOGS_RETENTION_DAYS}d, alerts resueltas > ${RESOLVED_ALERTS_RETENTION_MONTHS}m, cada ${INTERVAL_HOURS}h`);
