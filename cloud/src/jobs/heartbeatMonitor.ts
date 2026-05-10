import knex from 'knex';
import knexConfig from '../db/knexfile';

const db = knex(knexConfig.development);

const OFFLINE_THRESHOLD_MINUTES = 5; // Si no hay heartbeat en 5 min → sin señal

/**
 * Marca como 'offline' a los agentes activos que no enviaron heartbeat
 * en los últimos OFFLINE_THRESHOLD_MINUTES minutos.
 * Vuelven a 'active' automáticamente cuando retoman los heartbeats.
 */
async function checkOfflineAgents() {
  try {
    const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    // Marcar como offline los que estaban activos y dejaron de latir
    const markedOffline = await db('agents')
      .where('status', 'active')
      .where('last_seen', '<', cutoff)
      .update({ status: 'offline' });

    if (markedOffline > 0) {
      console.log(`[HeartbeatMonitor] ${markedOffline} agente(s) marcados OFFLINE (sin señal > ${OFFLINE_THRESHOLD_MINUTES} min)`);
    }

    // Reactivar los que volvieron (heartbeat reciente pero quedaron en offline)
    const reactivated = await db('agents')
      .where('status', 'offline')
      .where('last_seen', '>=', cutoff)
      .update({ status: 'active' });

    if (reactivated > 0) {
      console.log(`[HeartbeatMonitor] ${reactivated} agente(s) REACTIVADOS (heartbeat restaurado)`);
    }
  } catch (err: any) {
    console.error('[HeartbeatMonitor] Error en check:', err.message);
  }
}

// Ejecutar al arrancar y luego cada 2 minutos
checkOfflineAgents();
const intervalMs = 2 * 60 * 1000;
setInterval(checkOfflineAgents, intervalMs);

console.log(`[HeartbeatMonitor] Iniciado — umbral de desconexión: ${OFFLINE_THRESHOLD_MINUTES} min`);
