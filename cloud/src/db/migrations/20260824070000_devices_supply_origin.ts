import type { Knex } from "knex";

/**
 * Fase 10 del gap analysis vs HP SDS — detección de consumible no original.
 * `supply_origin` es el roll-up peor-caso de los 4 tóners que manda el
 * agente (`reading.supply_origin`, ver `agent/src/capture/normalize.ts`);
 * agentes viejos (<1.1.0) nunca lo mandan — `agentService.syncReadings`
 * deriva un fallback server-side desde `supplies_details` cuando falta, así
 * que la columna puede quedar poblada aun con una flota parcialmente
 * actualizada. `null` = sin señal (nunca `'genuine'` por defecto, mismo
 * criterio que el agente).
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("devices", "supply_origin");
  if (!hasColumn) {
    await knex.schema.alterTable("devices", (t) => {
      t.string("supply_origin", 20).nullable().defaultTo(null);
      t.timestamp("supply_origin_at", { useTz: true }).nullable();
    });
    await knex.raw(`ALTER TABLE devices ADD CONSTRAINT devices_supply_origin_check
      CHECK (supply_origin IS NULL OR supply_origin IN ('genuine','non_genuine'))`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_supply_origin_check`);
  const hasColumn = await knex.schema.hasColumn("devices", "supply_origin");
  if (hasColumn) {
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("supply_origin");
      t.dropColumn("supply_origin_at");
    });
  }
}
