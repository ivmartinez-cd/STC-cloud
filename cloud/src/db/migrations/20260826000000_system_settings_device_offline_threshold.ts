import type { Knex } from "knex";

/**
 * "Modelo unificado de umbrales" (gap analysis vs HP SDS, pendiente desde
 * R9 del 24/08/2026 — ver el docblock de `20260824210000_system_settings_
 * offline_threshold.ts`, que dejó esto deliberadamente diferido). Ese
 * umbral cubrió sólo el del AGENTE (`agent_offline_threshold_minutes`); el
 * del EQUIPO (`DEVICE_OFFLINE_THRESHOLD_MINUTES` en `heartbeatMonitor.ts`,
 * `DEVICE_OFFLINE_THRESHOLD_MS` en `constants.ts` del portal, y las
 * expresiones SQL `DEVICE_ESTADO_SQL`/`AGENT_DEVICE_ESTADO_SQL` con
 * `INTERVAL '5 hours'` hardcodeado) seguía en 4 copias independientes del
 * mismo número. Se agrega la columna gemela en la misma tabla singleton —
 * mismo CHECK de rango que la existente (1-1440 min, hasta 24h alcanza de
 * sobra para "el equipo dejó de reportar", que hoy vale 300 = 5h).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("system_settings", (t) => {
    t.integer("device_offline_threshold_minutes").notNullable().defaultTo(300);
  });

  await knex.raw(`
    ALTER TABLE system_settings
      ADD CONSTRAINT system_settings_device_threshold_range_check
        CHECK (device_offline_threshold_minutes BETWEEN 1 AND 1440)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_device_threshold_range_check`);
  await knex.schema.alterTable("system_settings", (t) => {
    t.dropColumn("device_offline_threshold_minutes");
  });
}
