import type { Knex } from "knex";

/**
 * Handoff hifi #3, fase 5 (26/08/2026) — bug real: `deltas_sum` en
 * `knex-period-usage-query.ts` suma `total_delta`/`mono_delta`/`color_delta`
 * en tres `SUM(GREATEST(x,0))` INDEPENDIENTES sobre las mismas filas. Postgres
 * ignora NULL en cada SUM por separado (si `mono_pages`/`color_pages` vienen
 * NULL en algunas lecturas pero `total_pages` no, cada agregado promedia un
 * subconjunto de filas distinto) y el clamp a 0 es POR FILA, no coordinado
 * entre las tres columnas — nada garantiza `total = mono + color`.
 *
 * `delta_other` es el residuo explícito (`delta_total - delta_mono -
 * delta_color`) que hace que la igualdad cierre SIEMPRE, por construcción —
 * no es "otro tipo de página", es la diferencia entre lo que el contador
 * TOTAL reportó y lo que mono+color reportaron por separado.
 *
 * `delta_estimated` (nullable, sólo se llena si `had_counter_reset`) es una
 * ESTIMACIÓN a partir del promedio diario histórico del equipo (90 días
 * previos al período, `readings_daily_agg`) — el delta crudo de un equipo
 * que resetea el contador está subcontado a propósito (`GREATEST(delta,0)`
 * descarta el segmento negativo del reset), así que el número real de
 * páginas impresas queda oculto. Es informativo, no reemplaza `delta_total`
 * en los totales del cierre — una estimación no debe pisar silenciosamente
 * un valor de facturación ya persistido.
 *
 * `device_count`/`anomalies_count` en el header: hoy `had_counter_reset` es
 * sólo por línea y nunca se totaliza — se congelan al cerrar (igual criterio
 * de inmutabilidad que el resto del header).
 */
export async function up(knex: Knex): Promise<void> {
  const hasDeltaOther = await knex.schema.hasColumn("report_closure_lines", "delta_other");
  if (!hasDeltaOther) {
    await knex.schema.alterTable("report_closure_lines", (t) => {
      t.bigInteger("delta_other").notNullable().defaultTo(0);
      t.bigInteger("delta_estimated").nullable();
    });
  }
  const hasTotalOther = await knex.schema.hasColumn("report_closures", "total_other");
  if (!hasTotalOther) {
    await knex.schema.alterTable("report_closures", (t) => {
      t.bigInteger("total_other").notNullable().defaultTo(0);
      t.integer("device_count").notNullable().defaultTo(0);
      t.integer("anomalies_count").notNullable().defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("report_closures", (t) => {
    t.dropColumn("total_other");
    t.dropColumn("device_count");
    t.dropColumn("anomalies_count");
  });
  await knex.schema.alterTable("report_closure_lines", (t) => {
    t.dropColumn("delta_other");
    t.dropColumn("delta_estimated");
  });
}
