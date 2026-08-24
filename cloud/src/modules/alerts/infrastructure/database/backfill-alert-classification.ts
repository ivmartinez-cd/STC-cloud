import type { Knex } from "knex";
import { classifyAlert } from "../../domain/services/alert-catalog";

const BATCH_SIZE = 5000;

/**
 * Reclasifica alertas existentes en lotes (usado por la migración de backfill
 * `20260824010000_alerts_classification_and_origin.ts` y, en el futuro, si el
 * catálogo crece). `onlyNull: true` sólo toca filas sin clasificar todavía — una
 * migración vieja re-corrida en una base limpia usa el catálogo ACTUAL (es
 * metadata derivada, no historia; ver docblock de la migración).
 */
export async function backfillAlertClassification(
  knex: Knex,
  opts: { onlyNull: boolean } = { onlyNull: true }
): Promise<number> {
  let totalUpdated = 0;

  for (;;) {
    const query = knex("alerts").select("id", "type", "message").orderBy("id").limit(BATCH_SIZE);
    if (opts.onlyNull) query.whereNull("alert_class");
    const rows: Array<{ id: number; type: string; message: string | null }> = await query;
    if (rows.length === 0) break;

    await knex.transaction(async (trx) => {
      for (const row of rows) {
        const { reason, klass, responder } = classifyAlert(row.type, row.message);
        await trx("alerts").where("id", row.id).update({ alert_class: klass, alert_reason: reason, responder });
      }
    });

    totalUpdated += rows.length;
    if (!opts.onlyNull || rows.length < BATCH_SIZE) break;
  }

  return totalUpdated;
}
