import { Knex } from "knex";
import crypto from "crypto";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { logger } from "../logger";
import { classifyAlert } from "./alertCatalog";

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
  /**
   * `'cloud'` (default): la abrimos nosotros mismos (toner_*, counter_reset,
   * device_offline, agent_offline, device_still_reporting). `'device'`: viene
   * tal cual del equipo (EWS/SNMP crudo). Reemplaza la vieja blocklist
   * `NON_EWS_RESERVED_TYPES` de `resolveStaleDeviceAlerts` — ver migración
   * `20260824010000_alerts_classification_and_origin.ts`.
   */
  origin?: "cloud" | "device";
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
  const { deviceId, agentId, type, severity, message, value, origin = "cloud" } = params;
  if (!deviceId && !agentId) {
    throw new Error("openAlert requiere deviceId o agentId");
  }

  // Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular. Un
  // equipo `disabled`/`reports_only` no debe generar alertas nuevas (`full`/
  // `supplies_only` sí). Chequeo previo por PK (`devices.id`, barato) en vez
  // de un INSERT...SELECT...WHERE EXISTS: `openAlert` es la única primitiva
  // de escritura, así que este único punto cubre `alertWorker`,
  // `agentService` y `heartbeatMonitor` de una sola vez. Ventana de carrera
  // benigna: si el estado cambia entre este SELECT y el INSERT de abajo, es
  // una toggle de operador en el medio de una sync — no una condición que
  // haya que resolver con un lock.
  //
  // Fase 7: mismo chequeo (misma query, columna extra) para
  // `registration_state` — un equipo `pending`/`ignored` tampoco debe
  // alertar. `pending` es la definición de "todavía no es parte de la
  // flota" (un cliente con `device_approval_required` no quiere que un
  // hallazgo de discovery le mande un mail antes de aprobarlo); `ignored`
  // es una decisión humana explícita de "esto no es un activo mío".
  if (deviceId) {
    const device = await db("devices").where({ id: deviceId }).select("monitor_state", "registration_state").first();
    const monitorOk = device && (device.monitor_state === "full" || device.monitor_state === "supplies_only");
    const registrationOk = device && device.registration_state === "registered";
    if (device && (!monitorOk || !registrationOk)) {
      return { created: false };
    }
  }

  const conflictTarget = deviceId
    ? db.raw("(device_id, type) WHERE resolved = false AND device_id IS NOT NULL")
    : db.raw("(agent_id, type) WHERE resolved = false AND agent_id IS NOT NULL");

  const truncatedType = type.slice(0, 50);
  const { reason, klass, responder } = classifyAlert(truncatedType, message);

  const rows = await db("alerts")
    .insert({
      device_id: deviceId ?? null,
      agent_id: agentId ?? null,
      type: truncatedType,
      severity,
      message,
      value: value ?? null,
      resolved: false,
      alert_class: klass,
      alert_reason: reason,
      responder,
      origin,
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
 * Resuelve las alertas de ORIGEN DISPOSITIVO (`origin='device'`) de un equipo que
 * estaban abiertas pero cuyo `type` ya no aparece en `currentTypes` de la
 * sincronización actual — el equipo dejó de reportarlas. Antes esto usaba una
 * blocklist (`NON_EWS_RESERVED_TYPES`) que asumía "todo lo que no sea un puñado de
 * tipos internos es EWS" — una negación abierta que cada tipo interno nuevo volvía
 * a romper (bug real: `device_error` y `device_still_reporting` no estaban
 * protegidos, así que cualquier sync con alertas EWS los auto-resolvía sin querer).
 * Filtrar por `origin='device'` (positivo, no negativo) cierra la CLASE de bug
 * entera, no sólo la instancia — ver migración
 * `20260824010000_alerts_classification_and_origin.ts`.
 *
 * `currentTypes` vacío resuelve todas las de origen dispositivo abiertas de ese
 * equipo (el caso correcto cuando el sync trae `alerts: []` explícito).
 */
export async function resolveStaleDeviceAlerts(
  db: Knex,
  params: { deviceId: string; currentTypes: string[] }
): Promise<number> {
  const { deviceId, currentTypes } = params;
  return db("alerts")
    .where({ device_id: deviceId, resolved: false, origin: "device" })
    .whereNotIn("type", currentTypes)
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
