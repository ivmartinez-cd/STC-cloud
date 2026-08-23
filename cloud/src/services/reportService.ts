import { Knex } from "knex";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { logger } from "../logger";

/**
 * Cierre mensual inmutable por cliente. `computePeriodUsage` es la única consulta
 * de verdad (generaliza la subconsulta LAG-based delta-sum que ya usan
 * `dashboardController`/`clientController.getClientUsage`/
 * `portalAgentController.getAgentDevices` de "un agente, mes en curso" a "un
 * cliente, período arbitrario") — la usan tanto el preview (no persiste nada) como
 * `closePeriod` (persiste lo mismo que ya vio el preview).
 */

export interface PeriodUsageLine {
  device_id: string;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  agent_id: string | null;
  agent_name: string | null;
  source: string | null;
  first_reading_at: Date | null;
  first_total: number | null;
  first_mono: number | null;
  first_color: number | null;
  last_reading_at: Date | null;
  last_total: number | null;
  last_mono: number | null;
  last_color: number | null;
  delta_total: number;
  delta_mono: number;
  delta_color: number;
  had_counter_reset: boolean;
}

/** Parsea "YYYY-MM" a los límites [inicio, fin) del mes calendario, en UTC. */
export function parsePeriod(period: string): { periodStart: Date; periodEnd: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error("Período inválido, se espera YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  if (month < 1 || month > 12) throw new Error("Período inválido, se espera YYYY-MM");
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  return { periodStart, periodEnd };
}

/** "YYYY-MM" a partir de un `period` (columna `date`, primer día del mes). */
export function formatPeriod(periodDate: Date): string {
  const d = new Date(periodDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Volumen del período por dispositivo, para un cliente. No escribe nada — la usan
 * tanto el preview como `closePeriod` (que persiste exactamente lo que esto
 * devuelve). Incluye dispositivos vía `devices.client_id` directo (identidad de
 * dispositivo por cliente, §2.4) — un equipo reasignado a otro cliente después
 * del período no se reatribuye retroactivamente, sigue el `client_id` ACTUAL.
 *
 * Regla de baja: un equipo dado de baja a mitad del período SÍ aparece en el
 * cierre de ESE mes (imprimió esas páginas, excluirlas regala volumen y rompe
 * la conciliación contra el contador físico) pero NO en los siguientes — de ahí
 * el filtro `decommissioned_at IS NULL OR decommissioned_at >= periodStart`. Sin
 * él, como las líneas se arman con LEFT JOIN, cada cierre arrastraría para
 * siempre todas las bajas históricas del cliente con delta 0. Las fusiones
 * (`merged_into`) se excluyen siempre: su historial ya vive en la fila
 * superviviente.
 */
export async function computePeriodUsage(
  db: Knex,
  params: { clientId: string; period: string }
): Promise<PeriodUsageLine[]> {
  const { clientId, period } = params;
  const { periodStart, periodEnd } = parsePeriod(period);

  const result = await db.raw(
    `
    WITH scoped_devices AS (
      SELECT d.id AS device_id, d.serial_number, d.model, d.brand, d.agent_id,
             a.name AS agent_name, d.poll_method
      FROM devices d
      LEFT JOIN agents a ON a.id = d.agent_id
      WHERE d.client_id = ?
        AND d.merged_into IS NULL
        AND (d.decommissioned_at IS NULL OR d.decommissioned_at >= ?::date)
    ),
    -- Ventana extendida 40 días atrás del inicio del período (mismo criterio que
    -- dashboardController/getClientUsage): el LAG del primer registro DENTRO del
    -- período necesita ver la última lectura del mes anterior como base.
    deltas AS (
      SELECT
        r.device_id, r.time, r.total_pages, r.mono_pages, r.color_pages,
        r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS total_delta,
        r.mono_pages  - LAG(r.mono_pages)  OVER (PARTITION BY r.device_id ORDER BY r.time) AS mono_delta,
        r.color_pages - LAG(r.color_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS color_delta
      FROM readings r
      JOIN scoped_devices sd ON sd.device_id = r.device_id
      WHERE r.time >= ?::date - INTERVAL '40 days' AND r.time < ?::date
    ),
    period_only AS (
      SELECT * FROM deltas WHERE time >= ?::date AND time < ?::date
    ),
    first_reading AS (
      SELECT DISTINCT ON (device_id) device_id, time AS first_reading_at,
             total_pages AS first_total, mono_pages AS first_mono, color_pages AS first_color
      FROM period_only ORDER BY device_id, time ASC
    ),
    last_reading AS (
      SELECT DISTINCT ON (device_id) device_id, time AS last_reading_at,
             total_pages AS last_total, mono_pages AS last_mono, color_pages AS last_color
      FROM period_only ORDER BY device_id, time DESC
    ),
    -- Suma de deltas POSITIVOS, no "last - first": un reset a mitad de mes daría
    -- un número negativo/erróneo con last-first; esta es la misma cuenta que ya
    -- usa el resto del código para no inflar/romper la facturación.
    deltas_sum AS (
      SELECT device_id,
        SUM(GREATEST(total_delta, 0))::bigint AS delta_total,
        SUM(GREATEST(mono_delta,  0))::bigint AS delta_mono,
        SUM(GREATEST(color_delta, 0))::bigint AS delta_color
      FROM period_only
      WHERE total_delta IS NOT NULL
      GROUP BY device_id
    ),
    resets AS (
      SELECT DISTINCT device_id FROM alerts
      WHERE type = 'counter_reset' AND device_id IS NOT NULL
        AND created_at >= ?::date AND created_at < ?::date
    )
    SELECT
      sd.device_id, sd.serial_number, sd.model, sd.brand, sd.agent_id, sd.agent_name,
      sd.poll_method AS source,
      fr.first_reading_at, fr.first_total, fr.first_mono, fr.first_color,
      lr.last_reading_at, lr.last_total, lr.last_mono, lr.last_color,
      COALESCE(ds.delta_total, 0) AS delta_total,
      COALESCE(ds.delta_mono,  0) AS delta_mono,
      COALESCE(ds.delta_color, 0) AS delta_color,
      (res.device_id IS NOT NULL) AS had_counter_reset
    FROM scoped_devices sd
    LEFT JOIN first_reading fr ON fr.device_id = sd.device_id
    LEFT JOIN last_reading  lr ON lr.device_id = sd.device_id
    LEFT JOIN deltas_sum    ds ON ds.device_id = sd.device_id
    LEFT JOIN resets       res ON res.device_id = sd.device_id
    ORDER BY sd.serial_number NULLS LAST
    `,
    [clientId, periodStart, periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd]
  );

  return result.rows as PeriodUsageLine[];
}

export interface CloseClosureResult {
  id: string;
  client_id: string;
  period: Date;
  status: string;
  closed_at: Date;
  total_pages: number;
  total_mono: number;
  total_color: number;
}

/**
 * Cierra un período: si ya hay un cierre `status='closed'` para (client_id,
 * period), tira `ClosurePeriodConflictError` (el controller la traduce a 409) — un
 * cierre existente nunca se sobreescribe, sólo se puede `reopenPeriod` primero.
 * Si hay uno `status='reopened'` para el mismo (client_id, period), este cierre
 * nuevo lo reemplaza y se linkea `superseded_by` en la fila vieja — la vieja
 * sigue existiendo (con sus columnas numéricas intactas) como historial de que
 * hubo un ajuste. Inserta header + líneas + audit log en UNA transacción.
 */
export class ClosurePeriodConflictError extends Error {}

// Conexión y cola propias para encolar la entrega — mismo criterio que
// `alertService.ts`/`jobs/notificationWorker.ts`: lazy, no compartida con el
// resto de la app. El encolado ocurre DESPUÉS de que la transacción de abajo
// commitea (ver el cierre de `closePeriod`) — si se encolara DENTRO de la
// transacción, el worker podría levantar el job y consultar `report_closures`
// antes de que el commit sea visible.
let reportDeliveryQueue: Queue | null = null;
function getReportDeliveryQueue(): Queue {
  if (!reportDeliveryQueue) {
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    reportDeliveryQueue = new Queue("report-delivery-queue", { connection: redis as any });
  }
  return reportDeliveryQueue;
}

export async function closePeriod(
  db: Knex,
  params: { clientId: string; period: string; userId: string | null; ipAddress: string }
): Promise<CloseClosureResult> {
  const { clientId, period, userId, ipAddress } = params;
  const { periodStart } = parsePeriod(period);

  const closure = await db.transaction(async (trx) => {
    const existing = await trx("report_closures")
      .where({ client_id: clientId, status: "closed" })
      .where("period", periodStart)
      .first();
    if (existing) {
      throw new ClosurePeriodConflictError(
        `Ya existe un cierre para ${period}. Reabrilo primero si necesitás uno nuevo.`
      );
    }

    const reopened = await trx("report_closures")
      .where({ client_id: clientId, status: "reopened" })
      .where("period", periodStart)
      .whereNull("superseded_by")
      .first();

    const lines = await computePeriodUsage(trx, { clientId, period });
    const totals = lines.reduce(
      (acc, l) => ({
        total_pages: acc.total_pages + Number(l.delta_total),
        total_mono: acc.total_mono + Number(l.delta_mono),
        total_color: acc.total_color + Number(l.delta_color),
      }),
      { total_pages: 0, total_mono: 0, total_color: 0 }
    );

    const [closure] = await trx("report_closures")
      .insert({
        client_id: clientId,
        period: periodStart,
        status: "closed",
        closed_by: userId,
        total_pages: totals.total_pages,
        total_mono: totals.total_mono,
        total_color: totals.total_color,
      })
      .returning("*");

    if (lines.length > 0) {
      await trx("report_closure_lines").insert(
        lines.map((l) => ({
          closure_id: closure.id,
          device_id: l.device_id,
          device_serial: l.serial_number,
          device_model: l.model,
          device_brand: l.brand,
          agent_id: l.agent_id,
          agent_name: l.agent_name,
          first_reading_at: l.first_reading_at,
          first_total_pages: l.first_total,
          first_mono_pages: l.first_mono,
          first_color_pages: l.first_color,
          last_reading_at: l.last_reading_at,
          last_total_pages: l.last_total,
          last_mono_pages: l.last_mono,
          last_color_pages: l.last_color,
          delta_total: l.delta_total,
          delta_mono: l.delta_mono,
          delta_color: l.delta_color,
          source: l.source,
          had_counter_reset: l.had_counter_reset,
        }))
      );
    }

    if (reopened) {
      await trx("report_closures").where({ id: reopened.id }).update({ superseded_by: closure.id });
    }

    await trx("audit_logs").insert({
      action: "REPORT_PERIOD_CLOSED",
      target_id: String(closure.id),
      user_id: userId,
      ip_address: ipAddress,
      metadata: JSON.stringify({
        client_id: clientId,
        period,
        device_count: lines.length,
        totals,
        supersedes: reopened?.id ?? null,
      }),
    });

    return closure as CloseClosureResult;
  });

  // Fuera de la transacción a propósito (ver comentario en getReportDeliveryQueue):
  // best-effort, una entrega perdida no debe tumbar el cierre en sí, que ya
  // commiteó correctamente.
  try {
    await getReportDeliveryQueue().add(
      "report.closed",
      { closureId: closure.id },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );
  } catch (err) {
    logger.error({ err }, "[reportService] No se pudo encolar la entrega del cierre");
  }

  return closure;
}

/**
 * Reabre un cierre — sólo cambia estado/auditoría (`status`, `reopened_at`,
 * `reopened_by`, `reopen_reason`). NUNCA toca las columnas numéricas del cierre ni
 * de sus líneas: la inmutabilidad real está en que no existe ningún endpoint que
 * actualice montos. Libera el período para un cierre nuevo; cuando ese cierre
 * nuevo se crea, `closePeriod` no lo sabe — es el controller quien, tras un
 * `reopenPeriod` + `closePeriod` sucesivo, debería (opcionalmente) linkear
 * `superseded_by` en la fila vieja.
 */
export async function reopenPeriod(
  db: Knex,
  params: { closureId: string; userId: string | null; reason: string | null; ipAddress: string }
): Promise<CloseClosureResult | null> {
  const { closureId, userId, reason, ipAddress } = params;

  return db.transaction(async (trx) => {
    const existing = await trx("report_closures").where({ id: closureId }).first();
    if (!existing) return null;

    const [updated] = await trx("report_closures")
      .where({ id: closureId })
      .update({
        status: "reopened",
        reopened_at: new Date(),
        reopened_by: userId,
        reopen_reason: reason,
      })
      .returning("*");

    await trx("audit_logs").insert({
      action: "REPORT_PERIOD_REOPENED",
      target_id: String(closureId),
      user_id: userId,
      ip_address: ipAddress,
      metadata: JSON.stringify({ reason }),
    });

    return updated as CloseClosureResult;
  });
}
