import type { Knex } from 'knex';

/**
 * Agregados continuos (Fase 2 del gap analysis: "dashboard y reportes
 * calculan sobre crudo" — acá se cierra la mitad de performance/escala, NO
 * la de facturación). Deliberadamente separados de la lógica de deltas con
 * detección de counter_reset que ya usa `reportService.ts` (`GREATEST(delta,
 * 0)` sobre `LAG()`) — esa lógica es demasiado stateful/secuencial para un
 * agregado continuo de Postgres, y replicarla mal acá arriesgaría números de
 * facturación sutilmente incorrectos. Estos agregados son de sólo
 * VISUALIZACIÓN (último valor del período por dispositivo, no deltas
 * validados) — pensados para acelerar gráficos de tendencia de largo plazo,
 * no para reemplazar el cierre mensual inmutable de `report_closures`.
 *
 * Sobreviven a la política de retención de `readings` crudo (2 años, ver
 * 20260823030000): un agregado continuo ya materializado NO depende de que
 * la fila cruda original siga existiendo.
 */
export async function up(knex: Knex): Promise<void> {
  const { rows: dailyExists } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'readings_daily_agg'`
  );
  if (dailyExists.length === 0) {
    await knex.raw(`
      CREATE MATERIALIZED VIEW readings_daily_agg
      WITH (timescaledb.continuous) AS
      SELECT
        device_id,
        time_bucket('1 day', time) AS day,
        last(total_pages, time)  AS total_pages,
        last(mono_pages, time)   AS mono_pages,
        last(color_pages, time)  AS color_pages,
        last(toner_black, time)  AS toner_black,
        last(toner_cyan, time)   AS toner_cyan,
        last(toner_magenta, time) AS toner_magenta,
        last(toner_yellow, time) AS toner_yellow,
        count(*) AS reading_count
      FROM readings
      GROUP BY device_id, day
      WITH NO DATA
    `);
    // `materialized_only` default es `true` en esta versión de TimescaleDB
    // (2.26.4) — se pasa a `false` (recomendado para uso tipo dashboard).
    // Confirmado corriendo la migración real: incluso con `false`, una
    // lectura recién insertada NO aparece hasta que corre el refresh
    // programado (`schedule_interval`: 1h acá, 6h para el mensual) o un
    // `CALL refresh_continuous_aggregate(...)` manual — no es instantáneo,
    // pero tampoco hace falta serlo para gráficos de tendencia de largo
    // plazo (a diferencia de `readings`/`report_closures`, que sí son de
    // lectura inmediata para operación día a día).
    await knex.raw(`ALTER MATERIALIZED VIEW readings_daily_agg SET (timescaledb.materialized_only = false)`);
    await knex.raw(`
      SELECT add_continuous_aggregate_policy('readings_daily_agg',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour')
    `);
  }

  const { rows: monthlyExists } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'readings_monthly_agg'`
  );
  if (monthlyExists.length === 0) {
    await knex.raw(`
      CREATE MATERIALIZED VIEW readings_monthly_agg
      WITH (timescaledb.continuous) AS
      SELECT
        device_id,
        time_bucket('1 month', time) AS month,
        last(total_pages, time)  AS total_pages,
        last(mono_pages, time)   AS mono_pages,
        last(color_pages, time)  AS color_pages,
        count(*) AS reading_count
      FROM readings
      GROUP BY device_id, month
      WITH NO DATA
    `);
    await knex.raw(`ALTER MATERIALIZED VIEW readings_monthly_agg SET (timescaledb.materialized_only = false)`);
    // start_offset/end_offset deben cubrir al menos 2 buckets (2 meses acá) —
    // '2 months' menos '1 hour' quedó justo por debajo de esa validación de
    // TimescaleDB ("policy refresh window too small"), confirmado corriendo
    // la migración real. '3 months' da margen de sobra.
    await knex.raw(`
      SELECT add_continuous_aggregate_policy('readings_monthly_agg',
        start_offset => INTERVAL '3 months',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '6 hours')
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS readings_monthly_agg CASCADE`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS readings_daily_agg CASCADE`);
}
