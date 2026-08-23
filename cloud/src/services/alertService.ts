import { Knex } from "knex";
import crypto from "crypto";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { logger } from "../logger";

/**
 * Fuente única para abrir/resolver alertas. Antes de esto había 3 escritores
 * independientes (`jobs/alertWorker.ts`, y dos bloques en `services/agentService.ts`
 * para `counter_reset` y alertas EWS) con dos claves de dedupe distintas — uno de
 * ellos (`alertWorker`) ya produjo duplicados reales en producción (SELECT-then-INSERT
 * sin índice único: dos jobs concurrentes para el mismo dispositivo pueden pasar el
 * SELECT antes de que cualquiera termine el INSERT).
 *
 * La migración `20260822010000_alerts_lifecycle_and_agent_scope.ts` agrega dos
 * índices únicos parciales — `(device_id,type) WHERE resolved=false` y
 * `(agent_id,type) WHERE resolved=false` — que `openAlert` usa como conflict target
 * de un `INSERT ... ON CONFLICT DO NOTHING` real, reemplazando la carrera por una
 * garantía de la base.
 */

export type AlertSeverity = "warning" | "critical";

export interface OpenAlertParams {
  /** Exactamente uno de deviceId/agentId debe venir seteado (ver CHECK de la migración). */
  deviceId?: string | null;
  agentId?: string | null;
  type: string;
  severity: AlertSeverity;
  message: string;
  value?: number | null;
}

export interface OpenAlertResult {
  /** `true` si se insertó una fila nueva; `false` si ya había una abierta (dedupe). */
  created: boolean;
  id?: number;
}

// Conexión y cola propias para encolar notificaciones — mismo criterio que
// `alertWorker.ts`/`heartbeatMonitor.ts`, cada job/servicio de este backend arma
// su propia conexión en vez de compartir una global (ver comentario en
// `jobs/notificationWorker.ts`, que es quien realmente procesa esta cola).
// Lazy: sólo se conecta la primera vez que de verdad hace falta encolar algo.
let notificationsQueue: Queue | null = null;
function getNotificationsQueue(): Queue {
  if (!notificationsQueue) {
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    notificationsQueue = new Queue("notifications-queue", { connection: redis as any });
  }
  return notificationsQueue;
}

/**
 * Abre una alerta si no hay una ya abierta con el mismo `(device_id|agent_id, type)`.
 * El conflict target se pasa como `db.raw(...)` porque apunta a un índice PARCIAL —
 * la forma de array de knex (`.onConflict(["a","b"])`) sólo puede expresar un índice
 * total, no el `WHERE resolved = false` (ver `node_modules/knex/lib/query/querycompiler.js`,
 * que pasa un `Raw` tal cual al SQL sin intentar interpretarlo como lista de columnas).
 */
export async function openAlert(db: Knex, params: OpenAlertParams): Promise<OpenAlertResult> {
  const { deviceId, agentId, type, severity, message, value } = params;
  if (!deviceId && !agentId) {
    throw new Error("openAlert requiere deviceId o agentId");
  }

  const conflictTarget = deviceId
    ? db.raw("(device_id, type) WHERE resolved = false AND device_id IS NOT NULL")
    : db.raw("(agent_id, type) WHERE resolved = false AND agent_id IS NOT NULL");

  const rows = await db("alerts")
    .insert({
      device_id: deviceId ?? null,
      agent_id: agentId ?? null,
      type: type.slice(0, 50),
      severity,
      message,
      value: value ?? null,
      resolved: false,
    })
    .onConflict(conflictTarget)
    .ignore()
    .returning("id");

  const created = rows.length > 0;
  const insertedId = rows[0]?.id;

  // Encolar notificación SÓLO en una inserción real (nunca en un hit de dedupe —
  // si no, cada sync mientras la alerta sigue abierta reenviaría el aviso) y sólo
  // para severidad crítica (agent_offline/counter_reset/toner_*_critical/EWS
  // graves; deliberadamente NO device_offline ni toner_*_low — ver
  // heartbeatMonitor.ts). El disparo real ocurre en `jobs/notificationWorker.ts`,
  // nunca acá: mandar el mail/webhook en línea bloquearía la ingesta de lecturas
  // (`agentService.syncReadings` puede abrir esto 50 veces en un solo request) o
  // arriesgaría el lock del Worker de `alertWorker.ts`.
  if (created && severity === "critical" && insertedId !== undefined) {
    try {
      await getNotificationsQueue().add(
        "alert.created",
        { alertId: insertedId },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      );
    } catch (err) {
      // Best-effort: una notificación perdida no debe tumbar la ingesta de la
      // alerta en sí, que ya se insertó correctamente.
      logger.error({ err }, "[alertService] No se pudo encolar la notificación");
    }
  }

  return { created, id: insertedId };
}

/** Resuelve (si estaba abierta) la alerta `(device_id|agent_id, type)` dada. */
export async function resolveAlert(
  db: Knex,
  params: { deviceId?: string | null; agentId?: string | null; type: string }
): Promise<number> {
  const { deviceId, agentId, type } = params;
  if (!deviceId && !agentId) {
    throw new Error("resolveAlert requiere deviceId o agentId");
  }
  return db("alerts")
    .where({ type, resolved: false })
    .modify((q) => {
      if (deviceId) q.andWhere("device_id", deviceId);
      else q.andWhere("agent_id", agentId as string);
    })
    .update({ resolved: true, resolved_at: new Date() });
}

/**
 * Tipos que NO son de origen EWS — reservados para que `resolveStaleEwsAlerts` no
 * los toque (esa función asume que cualquier tipo que no matchee esto es EWS).
 */
const NON_EWS_RESERVED_TYPES = ["counter_reset", "device_offline", "agent_offline"];

/**
 * Resuelve las alertas EWS de un dispositivo que estaban abiertas pero cuyo `type`
 * ya no aparece en la lista `currentTypes` de la sincronización actual — es decir,
 * el equipo dejó de reportarlas. Antes las alertas EWS no tenían NINGÚN camino de
 * auto-resolución (quedaban abiertas para siempre, incluso después de que el equipo
 * las limpiara). `currentTypes` vacío resuelve todas las EWS abiertas de ese equipo
 * (el caso correcto cuando el sync trae `alerts: []` explícito).
 */
export async function resolveStaleEwsAlerts(
  db: Knex,
  params: { deviceId: string; currentTypes: string[] }
): Promise<number> {
  const { deviceId, currentTypes } = params;
  return db("alerts")
    .where({ device_id: deviceId, resolved: false })
    .whereNotIn("type", [...NON_EWS_RESERVED_TYPES, ...currentTypes])
    .whereRaw("type !~ '^toner_'")
    .update({ resolved: true, resolved_at: new Date() });
}

/**
 * Deriva un `type` estable para una alerta EWS. Si el dispositivo manda `code` se
 * usa tal cual (es lo que hoy sucede en el 100% de las filas EWS reales); si no,
 * se sintetiza un hash corto del mensaje — así dos alertas EWS *distintas* del mismo
 * equipo (ambas sin código) no colapsan sobre un único type `EWS_ALERT` bajo la
 * nueva dedupe por tipo (antes deduplicaba por mensaje completo, así que esto no
 * importaba).
 */
export function synthesizeEwsAlertType(code: string | undefined | null, message: string): string {
  const trimmed = code?.trim();
  if (trimmed) return trimmed.slice(0, 50);
  return `ews_${crypto.createHash("sha1").update(message).digest("hex").slice(0, 12)}`;
}
