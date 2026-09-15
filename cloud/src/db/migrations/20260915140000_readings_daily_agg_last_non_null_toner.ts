import type { Knex } from "knex";

/**
 * `readings_daily_agg` perdía el nivel de tóner de casi todos los días.
 *
 * El agregado usaba `last(toner_black, time)`, que devuelve el valor de la
 * fila con el `time` más alto del día — incluso si ese valor es `NULL`. Como
 * los loops del agente son independientes (el de contadores corre mucho más
 * seguido que el de consumibles, ver `MonitorIntervals`), el último tick de
 * casi todos los días es uno de contadores, sin tóner. Medido en producción
 * el 15/09/2026 sobre un M5370LX: de 3 días con lecturas, el agregado tenía
 * nivel en 1; los otros 2 daban `NULL` con el 85% sentado en `readings`.
 *
 * Consecuencia: el "Historial del nivel de consumibles" del modal de detalle
 * salía vacío, y a los 24 meses (retención de `readings` crudo) ese nivel se
 * perdía para siempre, porque el agregado es lo único que sobrevive.
 *
 * Arreglo: `FILTER (WHERE ... IS NOT NULL)` para quedarse con la última
 * lectura REAL del día. Acá se aplica sólo a las 4 columnas de tóner.
 *
 * CORRECCIÓN (misma fecha, ver `20260915160000`): este comentario decía que
 * los contadores "no tienen el problema". Era falso — al re-materializar se
 * vio que `total_pages` se pierde igual (138 equipos-día el 14/09, sólo 68
 * con contador). Lo arregla la migración siguiente; se deja escrito acá para
 * que nadie vuelva a confiar en la afirmación original.
 *
 * Un agregado continuo no se puede alterar en su definición: hay que
 * recrearlo. Re-materializar lo reconstruye desde `readings`, así que se
 * recupera toda la historia que el crudo todavía tenga (24 meses). En esta
 * instalación `readings` arranca el 2026-09-10 y el agregado no tiene ni un
 * día anterior a eso — verificado antes de escribir esta migración —, o sea
 * que no se pierde nada. `device_usage_30d` se recrea igual porque depende de
 * la vista (su definición es la misma de `20260824030000`, sin cambios).
 */

const AGG_SELECT = `
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

const LEGACY_SELECT = `
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
`;

/** Misma definición que `20260824030000_devices_inventory_fields.ts` — se recrea porque depende del agregado. */
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

async function aggExists(knex: Knex): Promise<boolean> {
  const { rows } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'readings_daily_agg'`
  );
  return rows.length > 0;
}

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

/**
 * Reentrante a propósito: corre SIN transacción (`refresh_continuous_aggregate`
 * no puede correr dentro de una), así que un fallo a mitad de camino tiene que
 * poder arreglarse volviendo a correr la migración. Cada paso comprueba su
 * propio estado en vez de asumir el anterior.
 */
async function rebuild(knex: Knex, select: string, alreadyDone: (def: string) => boolean): Promise<void> {
  const { rows: ht } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'readings'`
  );
  if (ht.length === 0) return; // instalación sin TimescaleDB/hypertable

  if (await aggExists(knex)) {
    const { rows: def } = await knex.raw(
      `SELECT view_definition FROM timescaledb_information.continuous_aggregates WHERE view_name = 'readings_daily_agg'`
    );
    // Ya tiene la definición que queremos (migración re-corrida): no tocar nada.
    // Se compara por la PRESENCIA de `FILTER`, no por el texto exacto: Postgres
    // normaliza la definición al guardarla (agrega paréntesis, castea el
    // intervalo), así que buscar la cadena literal nunca matchearía.
    if (alreadyDone(String(def[0]?.view_definition ?? ''))) return;
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
  // Re-materializa todo el histórico que `readings` todavía tenga.
  await knex.raw(`CALL refresh_continuous_aggregate('readings_daily_agg', NULL, NULL)`);
  await knex.raw(USAGE_30D_VIEW);
}

/** `refresh_continuous_aggregate` no corre dentro de un bloque de transacción. */
export const config = { transaction: false };

/** La definición vieja no tiene ningún `FILTER`; la nueva tiene uno por tóner. */
const hasFilter = (def: string) => /\bFILTER\b/i.test(def);

export async function up(knex: Knex): Promise<void> {
  await rebuild(knex, AGG_SELECT, hasFilter);
}

export async function down(knex: Knex): Promise<void> {
  await rebuild(knex, LEGACY_SELECT, (def) => !hasFilter(def));
}
