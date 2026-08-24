import { Worker } from 'bullmq';
import Redis from 'ioredis';
import knex from 'knex';
import knexConfig from '../db/knexfile';
import * as alertService from '../services/alertService';
import { logger } from '../logger';

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

// Adaptadores sobre `alertService` — se conservan los nombres y firmas locales para
// no tocar los ~13 call-sites de abajo (3 aperturas + 10 resoluciones a través de
// los colores de tóner). El dedupe por SELECT-then-INSERT que tenían antes ya
// produjo duplicados reales en producción; `alertService.openAlert` usa el índice
// único parcial de la migración en su lugar.
async function openAlert(deviceId: string, type: string, severity: string, message: string, value: number) {
  const { created } = await alertService.openAlert(db, { deviceId, type, severity: severity as 'warning' | 'critical', message, value });
  if (created) {
    logger.info(`[Alert] OPEN [${severity.toUpperCase()}] device=${deviceId} — ${message}`);
  }
}

async function resolveAlerts(deviceId: string, type: string) {
  const updated = await alertService.resolveAlert(db, { deviceId, type });
  if (updated > 0) {
    logger.info(`[Alert] CLOSE type=${type} device=${deviceId}`);
  }
}

async function evaluateReading(r: MappedReading) {
  // 0. Un equipo dado de baja pero todavía enchufado no debe seguir generando
  // alertas críticas (counter_reset, toner_*_critical) que encolarían un mail al
  // cliente por un equipo que ya retiró (ver alertService.openAlert: sólo
  // severity "critical" encola notificationWorker).
  // `monitor_state` (Fase 5 del gap analysis vs HP SDS): el guard real vive
  // en `alertService.openAlert` (única primitiva de escritura), pero cortar
  // ACÁ además evita las 2 queries de umbrales de tóner de más abajo para
  // cada lectura de un equipo `reports_only`/`disabled` — pura eficiencia,
  // no una segunda fuente de verdad.
  const decomm = await db('devices').where('id', r.device_id).select('decommissioned_at', 'monitor_state', 'registration_state').first();
  if (decomm?.decommissioned_at) return;
  if (decomm && decomm.monitor_state !== 'full' && decomm.monitor_state !== 'supplies_only') return;
  // Fase 7 del gap analysis vs HP SDS: mismo corte por eficiencia para
  // `pending`/`ignored` — el guard real también vive en `alertService.openAlert`.
  if (decomm && decomm.registration_state !== 'registered') return;

  // 1. Manejo del estado offline del dispositivo — usa el MISMO type/severidad
  // que heartbeatMonitor.ts ('device_offline'/'warning', nunca 'critical': un
  // equipo puntual sin señal no es una caída de infraestructura, y así tampoco
  // dispara notificación). Antes este detector rápido (por lectura) escribía
  // 'device_error'/'critical', una postura distinta a la de heartbeatMonitor (la
  // red de seguridad, por staleness) para el mismo hecho — unificado en
  // migración 20260824010000_alerts_classification_and_origin.ts; con el mismo
  // type, el índice único los deduplica entre sí.
  if (r.offline) {
    await openAlert(r.device_id, 'device_offline', 'warning', 'Dispositivo fuera de línea (sin respuesta)', 0);
  } else {
    await resolveAlerts(r.device_id, 'device_offline');
  }

  // 2. Obtener umbrales dinámicos de la base de datos de acuerdo al agente asociado al dispositivo
  const device = await db('devices')
    .leftJoin('agents', 'devices.agent_id', 'agents.id')
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

  // 3. Evaluar colores de tóner (solo evaluar c/m/y si el equipo NO es monocromático)
  const isMonoOnly = r.color_pages === 0 || (r.toner_cyan === null && r.toner_magenta === null && r.toner_yellow === null);
  const colors = isMonoOnly ? ['black'] : ['black', 'cyan', 'magenta', 'yellow'];

  // Si es mono, resolver inmediatamente cualquier alerta residual de tóner color que se haya creado previamente
  if (isMonoOnly) {
    for (const cColor of ['cyan', 'magenta', 'yellow']) {
      await resolveAlerts(r.device_id, `toner_${cColor}_low`);
      await resolveAlerts(r.device_id, `toner_${cColor}_critical`);
    }
  }

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
  { connection: redis as any },
);

alertWorker.on('failed', (job, err) => {
  logger.error({ err: err.message }, `[AlertWorker] Job ${job?.id} failed`);
});

logger.info('[AlertWorker] Iniciado — Sistema de Toma de Contadores');

