import type { Knex } from "knex";

/**
 * Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular (punto
 * exacto de la comparativa: SDS distingue "Totalmente habilitado / Solo
 * consumibles / Solo informes / Deshabilitado" por equipo).
 *
 * NO se reutiliza `active`: `agentService.syncReadings` lo pone en `true` en
 * cada sync (dos ramas, UPDATE e INSERT) — un valor puesto por un operador
 * se perdería en el próximo ciclo de scan. Mismo argumento ya escrito para
 * `decommissioned_at` en `20260822030000_devices_client_id_and_lifecycle.ts`.
 *
 * Reemplaza el `devices.managed` boolean del plan original (ver el propio
 * plan, sección "Fase 5"): un boolean "gestionado/no gestionado" y este enum
 * de 4 niveles son el mismo concepto con distinta granularidad — `managed`
 * se deriva en el dashboard como `monitor_state <> 'disabled'`.
 */
export async function up(knex: Knex): Promise<void> {
  const hasMonitorState = await knex.schema.hasColumn("devices", "monitor_state");
  if (!hasMonitorState) {
    await knex.schema.alterTable("devices", (t) => {
      t.string("monitor_state", 20).notNullable().defaultTo("full");
      t.timestamp("monitor_state_changed_at", { useTz: true }).nullable();
      t.uuid("monitor_state_changed_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.text("monitor_state_reason").nullable();
    });
    await knex.raw(`
      ALTER TABLE devices ADD CONSTRAINT devices_monitor_state_check
        CHECK (monitor_state IN ('full','supplies_only','reports_only','disabled'))
    `);
    await knex.raw(`
      CREATE INDEX devices_monitor_state_idx ON devices (client_id, monitor_state) WHERE monitor_state <> 'full'
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS devices_monitor_state_idx`);
  const hasMonitorState = await knex.schema.hasColumn("devices", "monitor_state");
  if (hasMonitorState) {
    await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_monitor_state_check`);
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("monitor_state_reason");
      t.dropColumn("monitor_state_changed_by");
      t.dropColumn("monitor_state_changed_at");
      t.dropColumn("monitor_state");
    });
  }
}
