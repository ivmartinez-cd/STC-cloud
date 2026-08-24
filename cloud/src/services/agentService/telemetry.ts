import type { Knex } from "knex";
import { Queue } from "bullmq";
import { DEFAULT_BUSINESS_HOURS } from "../businessHours";
import { logger } from "../../logger";
import { mapWithConcurrency } from "./reading-helpers";
import { buildAgentLogRows, recordSyncFailureLog } from "./sync-log";
import { processReading } from "./sync-reading";
import type { IncomingLogEntry, IncomingReading, MappedReading, RedisClient, SystemInfoPayload } from "./types";

// Identidad de dispositivo por cliente (§2.4): se resuelve una sola vez por
// lote, no por lectura — un agente sin client_id (huérfano) no puede
// identificar nada por esta vía nueva y cae al comportamiento anterior
// (deviceId por agente) sólo para no romper la ingesta; en la práctica todo
// agente activo tiene client_id.
// Fase 7 del gap analysis vs HP SDS: `device_approval_required` viaja en el
// mismo join — en la práctica `registerDevices()` ya crea la fila primero
// (ver ahí el mismo gate), pero un agente sin el paso de discovery previo (o
// una carrera entre los dos) puede llegar acá siendo el primero en crearla.
async function resolveAgentClientContext(db: Knex, agentId: string): Promise<{ clientId: string | null; approvalRequired: boolean }> {
  const agentRow = await db("agents")
    .leftJoin("clients", "agents.client_id", "clients.id")
    .where("agents.id", agentId)
    .select("agents.client_id", "clients.device_approval_required")
    .first();
  return {
    clientId: agentRow?.client_id ?? null,
    approvalRequired: agentRow?.device_approval_required ?? false,
  };
}

// Auditoría de capacidad (200+ clientes, 23/08/2026): antes este loop era
// estrictamente secuencial, manteniendo una conexión del pool ocupada todo
// el tiempo que durara procesar el lote completo. Se paraleliza con un techo
// de concurrencia (`processReading` no cambia NADA de la lógica de negocio
// por dispositivo, sólo se ejecuta con varios workers en vez de uno).
//
// Advertencia de concurrencia deliberada: se agrupa por identidad CRUDA
// (`device_id`/`ip` tal como los manda el agente) para que dos lecturas del
// MISMO dispositivo dentro de un mismo lote se sigan procesando en orden
// estricto entre sí (evita un lost-update si ambas leen el estado viejo del
// dispositivo antes de que la otra escriba) — grupos DISTINTOS corren en
// paralelo. Esto cubre el caso realista (un agente nunca manda dos lecturas
// de la misma impresora en un mismo ciclo); NO cubre el caso extremo de que
// dos identidades crudas *distintas* terminen resolviendo al mismo
// `device_id` ya existente en la resolución de identidad — ese caso ya era
// una ventana de carrera preexistente entre agentes concurrentes distintos
// (el UPDATE del dispositivo corre fuera del advisory lock, que sólo
// protege la resolución de identidad en sí), no algo que este cambio
// introduzca nuevo.
function groupReadingsByIdentity(readings: IncomingReading[]): Map<string, IncomingReading[]> {
  const groups = new Map<string, IncomingReading[]>();
  for (const r of readings) {
    const rawKey = (r.device_id || r.ip || "").trim().toLowerCase() || `__no-identity-${groups.size}`;
    const group = groups.get(rawKey);
    if (group) group.push(r); else groups.set(rawKey, [r]);
  }
  return groups;
}

const READING_CONCURRENCY = 5;

// Cada grupo (misma identidad cruda) se procesa en orden estricto puertas
// adentro; grupos distintos corren con el techo de concurrencia de arriba.
async function processReadingGroups(
  db: Knex, agentId: string, clientId: string | null, approvalRequired: boolean, timezone: string,
  groups: Map<string, IncomingReading[]>
): Promise<MappedReading[]> {
  const groupResults = await mapWithConcurrency(
    Array.from(groups.values()),
    READING_CONCURRENCY,
    async (group) => {
      const out: MappedReading[] = [];
      for (const r of group) {
        const mapped = await processReading(db, agentId, clientId, approvalRequired, timezone, r);
        if (mapped) out.push(mapped);
      }
      return out;
    }
  );
  return groupResults.flat();
}

interface InsertResult {
  inserted: number;
  duplicates: number;
  newlyInsertedReadings: Array<{ device_id: string; time: Date; total_pages: number | null; mono_pages: number | null; color_pages: number | null }>;
}

async function insertMappedReadings(db: Knex, agentId: string, timezone: string, mappedReadings: MappedReading[]): Promise<InsertResult> {
  if (mappedReadings.length === 0) return { inserted: 0, duplicates: 0, newlyInsertedReadings: [] };

  try {
    // Filtrar lecturas para asegurar que el device_id exista en la tabla devices
    const deviceIds = [...new Set(mappedReadings.map(m => m.device_id))];
    const existingDevices = await db("devices").whereIn("id", deviceIds).pluck("id");
    const validDeviceSet = new Set(existingDevices.map(String));
    const validReadings = mappedReadings.filter(m => validDeviceSet.has(String(m.device_id)));

    if (validReadings.length === 0) return { inserted: 0, duplicates: 0, newlyInsertedReadings: [] };

    // Inserción masiva de lecturas válidas en el historial. ON CONFLICT
    // (reading_id, time) DO NOTHING: idempotencia ante reintentos del agente
    // (mismo lote reenviado tras perder la respuesta del servidor).
    const insertedRows = await db("readings")
      .insert(validReadings)
      .onConflict(["reading_id", "time"])
      .ignore()
      .returning(["reading_id", "device_id", "time", "total_pages", "mono_pages", "color_pages"]);
    return { inserted: insertedRows.length, duplicates: validReadings.length - insertedRows.length, newlyInsertedReadings: insertedRows };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, "[SYNC] Error al insertar lecturas");
    await recordSyncFailureLog(db, agentId, `Readings Insert Error: ${errMsg}`, timezone);
    throw err;
  }
}

async function enqueueAlertEvaluation(redis: RedisClient | undefined, mappedReadings: MappedReading[]): Promise<void> {
  try {
    const readingsQueue = new Queue("readings-queue", { connection: redis as any });
    await readingsQueue.add("evaluate-readings", { readings: mappedReadings });
  } catch (e: unknown) {
    logger.error({ err: e }, "[SYNC] BullMQ no disponible");
  }
}

// Webhook "reading.created" de la API pública — un job por BATCH de sync (no
// uno por lectura individual, evitaría saturar de POSTs a un ERP), con las
// filas REALMENTE insertadas (no `mappedReadings` crudo).
async function enqueueReadingWebhook(redis: RedisClient | undefined, newlyInsertedReadings: InsertResult["newlyInsertedReadings"]): Promise<void> {
  if (newlyInsertedReadings.length === 0) return;
  try {
    const publicReadingsQueue = new Queue("public-api-readings-queue", { connection: redis as any });
    await publicReadingsQueue.add("notify-readings", { readings: newlyInsertedReadings });
  } catch (e: unknown) {
    logger.error({ err: e }, "[SYNC] BullMQ (public-api-readings-queue) no disponible");
  }
}

/**
 * Ingesta de telemetría (lecturas, logs) y heartbeat de agentes DCA.
 *
 * NOTA (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md): `syncReadings`
 * pasó por dos pasadas — primero se movió verbatim junto con el resto del
 * módulo (demasiado crítico para decomponer en la misma pasada), después se
 * decompuso acá + `sync-reading.ts`/`sync-reading-fields.ts`/
 * `sync-reading-alerts.ts`/`sync-log.ts` en funciones nombradas por paso,
 * cada una con el MISMO orden y las MISMAS queries que el original —
 * extracción mecánica, ninguna regla de negocio cambió. Incluye preservar
 * una firma pre-existente rara: `syncReadings(redis, ...)` recibe `redis`
 * como parámetro pero usa `this.redis` adentro (parámetro muerto
 * pre-existente, no se "arregló" acá tampoco).
 */
export class AgentTelemetryService {
  constructor(private db: Knex, private redis?: RedisClient) {}

  /**
   * Ingesta de logs remotos enviados por el agente DCA.
   * Soporta timestamps en formato DD/MM/YYYY (agentes viejos, pre-ISO) y
   * ISO 8601 (agente actual).
   * @param agentId - UUID del agente emisor.
   * @param logs - Array de entradas de log con timestamp, nivel y mensaje.
   * @param timezone - TZ IANA del agente (resuelta por `agentAuth`, ver
   *   `authMiddleware.ts`) — sólo se usa para interpretar timestamps naive
   *   `DD/MM/YYYY` de binarios viejos; el agente actual manda ISO-UTC que no
   *   la necesita. Default: `DEFAULT_BUSINESS_HOURS.timezone`.
   */
  async ingestLogs(agentId: string, logs: IncomingLogEntry[], timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    if (!logs || logs.length === 0) return;
    await this.db("agent_logs").insert(buildAgentLogRows(agentId, logs, timezone));
  }

  async getLogs(agentId: string, limit: number = 50) {
    return await this.db("agent_logs")
      .where({ agent_id: agentId })
      .orderBy("timestamp", "desc")
      .limit(limit);
  }

  /**
   * Registra un latido (heartbeat) del agente, actualizando su último contacto
   * e información de sistema operativo del host.
   * @param agentId - UUID del agente emisor.
   * @param systemInfo - Datos opcionales del sistema (versión, hostname, OS, IP).
   */
  async heartbeat(agentId: string, systemInfo?: SystemInfoPayload) {
    if (!agentId) return;
    const updateData: Record<string, any> = { last_seen: new Date() };

    if (systemInfo) {
      if (systemInfo.version !== undefined) updateData.version = systemInfo.version;
      if (systemInfo.host_name !== undefined) updateData.host_name = systemInfo.host_name;
      if (systemInfo.host_os !== undefined) updateData.host_os = systemInfo.host_os;
      if (systemInfo.host_ip !== undefined) updateData.host_ip = systemInfo.host_ip;
      if (systemInfo.uptime !== undefined) updateData.uptime = systemInfo.uptime;
    }

    await this.db("agents").where({ id: agentId }).update(updateData);
    await this.db("agents").where({ id: agentId, status: "offline" }).update({ status: "active" });
  }

  /**
   * Sincroniza lecturas de telemetría desde el agente hacia la base de datos cloud.
   * Para cada lectura, realiza un UPSERT del dispositivo por serial_number y
   * registra la lectura en el historial de la tabla `readings`.
   *
   * @remarks
   * - La identidad del dispositivo se resuelve por CLIENTE (serial -> mac -> ip,
   *   ver `deviceIdentity.resolveDeviceIdentity`), no por agente — dos agentes
   *   del mismo cliente que ven la misma impresora física convergen a una sola
   *   fila. `resolveDeviceIdentity` toma un advisory lock por identidad para
   *   serializar sincronizaciones concurrentes, sin depender de un índice único.
   * - Los contadores se parsean con validación estricta (parseCount/parseToner).
   *
   * @param redis - Cliente Redis para encolar evaluaciones de alertas asíncronas.
   * @param readings - Array de lecturas crudas enviadas por el agente DCA.
   * @param agentId - UUID del agente emisor de la telemetría.
   */
  async syncReadings(redis: RedisClient, readings: IncomingReading[], agentId: string, timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    if (!readings || readings.length === 0) return { received: 0, inserted: 0, duplicates: 0 };

    // 0. Actualizar la última conexión del monitor / agente emisor
    try {
      await this.db("agents").where("id", agentId).update({ last_seen: new Date(), status: "active" });
    } catch { /* continuar si el agente fue eliminado */ }

    const { clientId, approvalRequired } = await resolveAgentClientContext(this.db, agentId);
    const groups = groupReadingsByIdentity(readings);
    const mappedReadings = await processReadingGroups(this.db, agentId, clientId, approvalRequired, timezone, groups);

    const { inserted, duplicates, newlyInsertedReadings } = await insertMappedReadings(this.db, agentId, timezone, mappedReadings);

    // Encolar evaluación de alertas de forma asíncrona
    await enqueueAlertEvaluation(this.redis, mappedReadings);
    await enqueueReadingWebhook(this.redis, newlyInsertedReadings);

    // Actualizar también el heartbeat del agente al sincronizar
    await this.heartbeat(agentId);

    return { received: readings.length, inserted, duplicates };
  }
}
