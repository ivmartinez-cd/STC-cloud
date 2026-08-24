import { Knex } from "knex";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { logger } from "../../logger";
import { computePeriodUsage, parsePeriod } from "./period-usage";

/**
 * Cierre mensual inmutable por cliente. `computePeriodUsage` (en `period-usage.ts`)
 * es la única consulta de verdad (generaliza la subconsulta LAG-based delta-sum
 * que ya usan `dashboardController`/`clientController.getClientUsage`/
 * `portalAgentController.getAgentDevices` de "un agente, mes en curso" a "un
 * cliente, período arbitrario") — la usan tanto el preview (no persiste nada) como
 * `closePeriod` (persiste lo mismo que ya vio el preview).
 */

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

function buildClosureLineRows(closureId: string, lines: Awaited<ReturnType<typeof computePeriodUsage>>) {
  return lines.map((l) => ({
    closure_id: closureId,
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
  }));
}

async function runClosePeriod(trx: Knex.Transaction, params: { clientId: string; period: string; userId: string | null; ipAddress: string }) {
  const { clientId, period, userId, ipAddress } = params;
  const { periodStart } = parsePeriod(period);

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
    await trx("report_closure_lines").insert(buildClosureLineRows(closure.id, lines));
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
}

export async function closePeriod(
  db: Knex,
  params: { clientId: string; period: string; userId: string | null; ipAddress: string }
): Promise<CloseClosureResult> {
  const closure = await db.transaction((trx) => runClosePeriod(trx, params));

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
