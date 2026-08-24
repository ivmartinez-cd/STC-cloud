import type { Knex } from "knex";

/**
 * R9 del gap analysis vs HP SDS: `Settings.tsx` tiene un campo "Tiempo de
 * Inactividad (Minutos)" que hoy sólo escribe a `localStorage` — nada lo
 * lee. El umbral REAL que abre `agent_offline` vive hardcodeado
 * (`OFFLINE_THRESHOLD_MINUTES`) en `jobs/heartbeatMonitor.ts`. Se agrega
 * una tabla singleton (una sola fila, forzada por CHECK) para que ese
 * campo controle de verdad el umbral del servidor.
 *
 * Deliberadamente NO se toca acá el resto de las copias del mismo
 * concepto (`DEVICE_OFFLINE_THRESHOLD_MINUTES` del mismo archivo,
 * `OFFLINE_THRESHOLD_MS`/`DEVICE_OFFLINE_THRESHOLD_MS` del portal) — eso
 * es el "modelo unificado de umbrales" que el gap analysis ya marca como
 * una pasada aparte, deliberadamente diferida. Este umbral (el del
 * agente, el único con un control de UI ya construido para él) es el
 * único que se conecta en esta pasada.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable("system_settings");
  if (has) return;

  await knex.schema.createTable("system_settings", (t) => {
    // Truco de tabla singleton: `id` sólo puede ser `true`, así que un
    // segundo INSERT viola la PK — a diferencia de un `WHERE id = 1`
    // convencional, esto lo hace imposible a nivel de esquema, no de
    // disciplina de aplicación.
    t.boolean("id").primary().defaultTo(true);
    t.integer("agent_offline_threshold_minutes").notNullable().defaultTo(5);
    t.timestamp("updated_at", { useTz: true }).nullable();
    t.uuid("updated_by").nullable().references("id").inTable("users").onDelete("SET NULL");
  });

  await knex.raw(`
    ALTER TABLE system_settings
      ADD CONSTRAINT system_settings_singleton_check CHECK (id),
      ADD CONSTRAINT system_settings_threshold_range_check
        CHECK (agent_offline_threshold_minutes BETWEEN 1 AND 1440)
  `);

  await knex("system_settings").insert({ id: true, agent_offline_threshold_minutes: 5 });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("system_settings");
}
