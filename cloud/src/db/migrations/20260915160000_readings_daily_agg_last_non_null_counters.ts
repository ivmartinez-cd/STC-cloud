import type { Knex } from "knex";

/**
 * Segunda mitad del arreglo de `20260915140000`: los CONTADORES pierden días
 * por el mismo motivo que perdían el tóner.
 *
 * La migración anterior sólo puso `FILTER (WHERE ... IS NOT NULL)` en las 4
 * columnas de tóner, con un comentario que decía que los contadores "no
 * tienen el problema". **Eso estaba mal** — se verificó en producción apenas
 * se re-materializó el agregado: el 14/09/2026 había 138 equipos-día y sólo
 * 68 con `total_pages`. Ejemplos concretos del mismo día, con el agregado en
 * NULL y el valor real sentado en `readings`:
 *
 *   076UBJFH300042F → 3443    076UBJFG800093J → 8769
 *   076UBJFJA0006SJ → 2508    076UBJFH30003YZ → 3428
 *
 * La causa es idéntica: `last(total_pages, time)` toma la fila con el `time`
 * más alto del día aunque el valor sea NULL, y el loop de consumibles del
 * agente escribe lecturas con tóner pero sin contadores. Si ese tick queda
 * último, el día entero pierde el contador.
 *
 * A quién afecta: `device_usage_30d` (deltas con LAG — un día en NULL corta
 * la cadena y subestima el consumo), que alimenta el ritmo de impresión de
 * `usageRatesFor` y por lo tanto la estimación de "días restantes" de TODOS
 * los consumibles de la flota; también `RESET_ESTIMATE_SQL` del módulo de
 * reportes. Ninguno de los dos es un número de facturación: los cierres
 * mensuales se calculan en `reportService` sobre `readings` crudo con
 * detección de counter_reset, y no tocan este agregado (verificado). Por eso
 * el `FILTER` acá sólo puede mejorar la precisión, nunca cambiar una factura.
 *
 * Misma mecánica que la anterior: sin transacción y reentrante.
 */

const AGG_SELECT = `
  SELECT
    device_id,
    time_bucket('1 day', time) AS day,
    last(total_pages, time)   FILTER (WHERE total_pages IS NOT NULL)   AS total_pages,
    last(mono_pages, time)    FILTER (WHERE mono_pages IS NOT NULL)    AS mono_pages,
    last(color_pages, time)   FILTER (WHERE color_pages IS NOT NULL)   AS color_pages,
    last(toner_black, time)   FILTER (WHERE toner_black IS NOT NULL)   AS toner_black,
    last(toner_cyan, time)    FILTER (WHERE toner_cyan IS NOT NULL)    AS toner_cyan,
    last(toner_magenta, time) FILTER (WHERE toner_magenta IS NOT NULL) AS toner_magenta,
    last(toner_yellow, time)  FILTER (WHERE toner_yellow IS NOT NULL)  AS toner_yellow,
    count(*) AS reading_count
  FROM readings
  GROUP BY device_id, day
`;

/** Estado al que vuelve el `down`: sólo los tóners filtrados (el de 20260915140000). */
const PREVIOUS_SELECT = `
  SELECT
    device_id,
    time_bucket('1 day', time) AS day,
    last(total_pages, time)  AS total_pages,
    last(mono_pages, time)   AS mono_pages,
    last(color_pages, time)  AS color_pages,
    last(toner_black, time)   FILTER (WHERE toner_black IS NOT NULL)   AS toner_black,
    last(toner_cyan, time)    FILTER (WHERE toner_cyan IS NOT NULL)    AS toner_cyan,
    last(toner_magenta, time) FILTER (WHERE toner_magenta IS NOT NULL) AS toner_magenta,
    last(toner_yellow, time)  FILTER (WHERE toner_yellow IS NOT NULL)  AS toner_yellow,
    count(*) AS reading_count
  FROM readings
  GROUP BY device_id, day
`;

/** Misma definición que `20260824030000_devices_inventory_fields.ts` — depende del agregado. */
const USAGE_30D_VIEW = `
  CREATE OR REPLACE VIEW device_usage_30d AS
  SELECT device_id,
         SUM(GREATEST(d_total, 0))::bigint AS pages_30d,
         SUM(GREATEST(d_mono,  0))::bigint AS mono_30d,
         SUM(GREATEST(d_color, 0))::bigint AS color_30d
  FROM (
    SELECT device_id, day,
           total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY day) AS d_total,
           mono_pages  - LAG(mono_pages)  OVER (PARTITION BY device_id ORDER BY day) AS d_mono,
           color_pages - LAG(color_pages) OVER (PARTITION BY device_id ORDER BY day) AS d_color
    FROM readings_daily_agg
    WHERE day >= now() - INTERVAL '32 days'
  ) s
  WHERE day >= now() - INTERVAL '30 days'
  GROUP BY device_id
`;

async function policyExists(knex: Knex): Promise<boolean> {
  const { rows } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.jobs
      WHERE proc_name = 'policy_refresh_continuous_aggregate'
        AND hypertable_name = (SELECT materialization_hypertable_name
                               FROM timescaledb_information.continuous_aggregates
                               WHERE view_name = 'readings_daily_agg')`
  );
  return rows.length > 0;
}

async function rebuild(knex: Knex, select: string, alreadyDone: (def: string) => boolean): Promise<void> {
  const { rows: ht } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'readings'`
  );
  if (ht.length === 0) return;

  const { rows: agg } = await knex.raw(
    `SELECT view_definition FROM timescaledb_information.continuous_aggregates WHERE view_name = 'readings_daily_agg'`
  );
  if (agg.length > 0) {
    if (alreadyDone(String(agg[0]?.view_definition ?? ''))) return;
    await knex.raw(`DROP VIEW IF EXISTS device_usage_30d`);
    await knex.raw(`DROP MATERIALIZED VIEW readings_daily_agg CASCADE`);
  }

  await knex.raw(`CREATE MATERIALIZED VIEW IF NOT EXISTS readings_daily_agg WITH (timescaledb.continuous) AS ${select} WITH NO DATA`);
  await knex.raw(`ALTER MATERIALIZED VIEW readings_daily_agg SET (timescaledb.materialized_only = false)`);
  if (!(await policyExists(knex))) {
    await knex.raw(`
      SELECT add_continuous_aggregate_policy('readings_daily_agg',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour')
    `);
  }
  await knex.raw(`CALL refresh_continuous_aggregate('readings_daily_agg', NULL, NULL)`);
  await knex.raw(USAGE_30D_VIEW);
}

/** Cuenta los `FILTER` de la definición: 7 = contadores incluidos, 4 = sólo tóners. */
const filterCount = (def: string) => (def.match(/\bFILTER\b/gi) ?? []).length;

/** `refresh_continuous_aggregate` no corre dentro de un bloque de transacción. */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await rebuild(knex, AGG_SELECT, (def) => filterCount(def) >= 7);
}

export async function down(knex: Knex): Promise<void> {
  await rebuild(knex, PREVIOUS_SELECT, (def) => filterCount(def) > 0 && filterCount(def) < 7);
}
