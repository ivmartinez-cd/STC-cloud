import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Elimina la restricción de check de Knex para permitir tipos de alerta dinámicos
  await knex.raw("ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check");
  await knex.raw("ALTER TABLE alerts ALTER COLUMN type TYPE VARCHAR(50)");
}

export async function down(knex: Knex): Promise<void> {
  // Restaura la restricción original
  await knex.raw(`
    ALTER TABLE alerts 
    ADD CONSTRAINT alerts_type_check 
    CHECK (type IN ('toner_low', 'toner_critical', 'device_error', 'agent_offline'))
  `);
}
