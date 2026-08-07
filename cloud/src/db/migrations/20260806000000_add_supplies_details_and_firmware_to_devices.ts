import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasSupplies = await knex.schema.hasColumn('devices', 'supplies_details');
  const hasFirmware = await knex.schema.hasColumn('devices', 'firmware');

  await knex.schema.alterTable('devices', (t) => {
    if (!hasSupplies) t.jsonb('supplies_details').nullable().defaultTo(null);
    if (!hasFirmware) t.string('firmware', 100).nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (t) => {
    t.dropColumn('supplies_details');
    t.dropColumn('firmware');
  });
}
