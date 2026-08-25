import knex from 'knex';
import { runGuardedTick } from "../modules/observability/guarded-tick";
import knexConfig from '../db/knexfile';
import * as alertService from '../modules/alerts';
import { readSystemSettings } from "../modules/system-settings";
import { logger } from '../logger';

const db = knex(knexConfig.development);

// Default de arranque / fail-open si `system_settings` no responde por
// algún motivo — nunca debe tumbar el tick completo por un umbral no
// disponible. El valor real, configurable por el admin desde
// `Settings.tsx` (R9 del gap analysis vs HP SDS), se lee de nuevo en
// CADA tick (ver `runChecks()`) — así un cambio del admin aplica dentro
// de los 2 minutos del próximo ciclo, sin reiniciar el proceso.
const DEFAULT_OFFLINE_THRESHOLD_MINUTES = 5;
/**
 * Bug real (23/08/2026): estaba en 30 min. El agente reduce su propia
 * frecuencia fuera del horario laboral configurado (`agents.business_hours`,
 * default Mon-Fri 08-18) — los loops de meter/supplies pasan de 20/60 min a
 * **4 horas** fuera de esa ventana (`INTERVALS.meter.off`/`supplies.off` en
 * `agent/src/core/BusinessHours.ts`). Con 30 min, cualquier equipo de un
 * agente real (no sólo de prueba) abría `device_offline` la mayor parte de
 * cada franja fuera de horario aunque estuviera reportando con normalidad —
 * confirmado en el stack de desarrollo con un agente con lecturas reales cada
 * ~40 min. Subido a 5 horas (4h del peor caso + 1h de margen) — debe
 * coincidir con `DEVICE_OFFLINE_THRESHOLD_MS` de
 * `cloud/portal/src/lib/constants.ts` (mismo criterio, no unificado en un
 * solo lugar todavía — "modelo unificado de umbrales" sigue pendiente en el
 * gap analysis).
 */
const DEVICE_OFFLINE_THRESHOLD_MINUTES = 5 * 60;

/**
 * Se queda como `setInterval` a propósito — NO se convierte a un BullMQ repeatable
 * job. NOTA (23/08/2026): el riesgo original citado acá (Redis de producción con
 * `maxmemoryPolicy: allkeys-lru` en `render.yaml`, evictando en silencio las claves
 * de un repeatable job) ya NO aplica — producción dejó de correr en Render, y el
 * Redis self-hosted actual (`docker-compose.prod.yml`) no fija ningún
 * `maxmemory-policy` explícito (default de Redis, sin eviction). La razón que sigue
 * vigente es más simple: `setInterval` + advisory lock de Postgres al principio
 * de cada tick (implementado el 24/08/2026 en la Fase 5 de producción-readiness
 * vía `modules/observability/guarded-tick.ts`) — replica-safe sin cola.
 */

/**
 * Marca como 'offline' a los agentes activos que no enviaron heartbeat en
 * los últimos `thresholdMinutes` minutos (configurable, ver `runChecks()`),
 * y abre una alerta `agent_offline` por cada uno (antes: el enum la
 * declaraba pero ningún código la escribía). Vuelven a 'active'
 * automáticamente cuando retoman los heartbeats, y la alerta se resuelve
 * sola.
 */
async function checkOfflineAgents(thresholdMinutes: number) {
  try {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    // Marcar como offline los que estaban activos y dejaron de latir. `.returning`
    // trae los ids afectados — antes sólo se contaban, ahora hace falta abrir una
    // alerta POR agente.
    const markedOffline = await db('agents')
      .where('status', 'active')
      .where('last_seen', '<', cutoff)
      .update({ status: 'offline' })
      .returning(['id', 'name']);

    for (const agent of markedOffline) {
      await alertService.openAlert(db, {
        agentId: agent.id,
        type: 'agent_offline',
        severity: 'critical',
        message: `Monitor sin señal (sin heartbeat hace más de ${thresholdMinutes} min)`,
      });
    }
    if (markedOffline.length > 0) {
      logger.info(`[HeartbeatMonitor] ${markedOffline.length} agente(s) marcados OFFLINE (sin señal > ${thresholdMinutes} min)`);
    }

    // Reactivar los que volvieron (heartbeat reciente pero quedaron en offline)
    const reactivated = await db('agents')
      .where('status', 'offline')
      .where('last_seen', '>=', cutoff)
      .update({ status: 'active' })
      .returning(['id']);

    for (const agent of reactivated) {
      await alertService.resolveAlert(db, { agentId: agent.id, type: 'agent_offline' });
    }
    if (reactivated.length > 0) {
      logger.info(`[HeartbeatMonitor] ${reactivated.length} agente(s) REACTIVADOS (heartbeat restaurado)`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, '[HeartbeatMonitor] Error en check de agentes');
  }
}

/**
 * Abre/resuelve alertas `device_offline` para equipos activos sin lecturas
 * recientes. A diferencia de `agents.status`, `devices` no tiene una columna de
 * estado que "voltear" — cada corrida vuelve a evaluar quién está stale y quién
 * volvió, y confía en el índice único parcial de `alerts` para no reabrir una fila
 * ya abierta (mismo mecanismo que el resto de `alertService`).
 *
 * Supresión de tormenta: se excluyen los equipos cuyo agente YA está `offline` —
 * un agente caído deja stale a TODOS sus equipos a la vez, y ese agente ya generó
 * su propia alerta `agent_offline`; una fila `device_offline` por cada impresora
 * del sitio sería puro ruido redundante.
 */
async function checkOfflineDevices() {
  try {
    const cutoff = new Date(Date.now() - DEVICE_OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    // Un equipo dado de baja tiene `last_seen` viejo por definición: sin este
    // filtro calificaría en CADA corrida (cada 2 min) y su `device_offline`
    // quedaría abierta para siempre (la resolución exige `last_seen >= cutoff`,
    // que nunca vuelve a cumplirse), reabriéndose si un operador la resolviera
    // a mano. Las lápidas de fusión tampoco deben generar alertas propias.
    const staleDevices = await db('devices')
      .join('agents', 'devices.agent_id', 'agents.id')
      .where('devices.active', true)
      .whereNull('devices.decommissioned_at')
      .whereNull('devices.merged_into')
      .where('devices.last_seen', '<', cutoff)
      .whereNot('agents.status', 'offline')
      .select('devices.id', 'devices.name');

    let opened = 0;
    for (const device of staleDevices) {
      // severity "warning" (no "critical") a propósito: un equipo puntual sin
      // señal no es una caída de infraestructura, y así tampoco dispara una
      // notificación (que sólo se activa por severity==="critical").
      const { created } = await alertService.openAlert(db, {
        deviceId: device.id,
        type: 'device_offline',
        severity: 'warning',
        message: `Equipo sin señal (sin lecturas hace más de ${DEVICE_OFFLINE_THRESHOLD_MINUTES} min)`,
      });
      if (created) opened++;
    }
    if (opened > 0) {
      logger.info(`[HeartbeatMonitor] ${opened} equipo(s) marcados sin señal (> ${DEVICE_OFFLINE_THRESHOLD_MINUTES} min)`);
    }

    // Resolver device_offline de equipos que volvieron a reportar.
    const toResolve = await db('alerts')
      .join('devices', 'alerts.device_id', 'devices.id')
      .where('alerts.type', 'device_offline')
      .where('alerts.resolved', false)
      .where('devices.last_seen', '>=', cutoff)
      .select('alerts.device_id');

    let resolved = 0;
    for (const row of toResolve) {
      const updated = await alertService.resolveAlert(db, { deviceId: row.device_id, type: 'device_offline' });
      resolved += updated;
    }
    if (resolved > 0) {
      logger.info(`[HeartbeatMonitor] ${resolved} equipo(s) recuperaron señal`);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, '[HeartbeatMonitor] Error en check de dispositivos');
  }
}

async function runChecks() {
  // Lock multi-réplica + métricas + Sentry (Fase 5.3) — implementa el advisory
  // lock que el docblock de arriba dejó prescripto para multi-réplica.
  await runGuardedTick(db, "heartbeat-monitor", async () => {
    // Leído de nuevo en CADA tick (no cacheado a nivel de módulo) — así un
    // cambio del admin en Settings.tsx aplica sin reiniciar el proceso.
    // Fail-open al default si la tabla no responde: un umbral no
    // disponible nunca debe tumbar el tick completo.
    let thresholdMinutes = DEFAULT_OFFLINE_THRESHOLD_MINUTES;
    try {
      thresholdMinutes = (await readSystemSettings(db)).agentOfflineThresholdMinutes;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errMsg }, `[HeartbeatMonitor] No se pudo leer system_settings, usando default (${DEFAULT_OFFLINE_THRESHOLD_MINUTES} min)`);
    }

    await checkOfflineAgents(thresholdMinutes);
    await checkOfflineDevices();
  });
}

// Ejecutar al arrancar y luego cada 2 minutos
runChecks();
const intervalMs = 2 * 60 * 1000;
setInterval(runChecks, intervalMs);

logger.info(`[HeartbeatMonitor] Iniciado — umbral agente: configurable desde Settings (default ${DEFAULT_OFFLINE_THRESHOLD_MINUTES} min), umbral equipo: ${DEVICE_OFFLINE_THRESHOLD_MINUTES} min`);
