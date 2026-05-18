import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (t) => {
    t.smallint('toner_black').nullable().defaultTo(null);
    t.smallint('toner_cyan').nullable().defaultTo(null);
    t.smallint('toner_magenta').nullable().defaultTo(null);
    t.smallint('toner_yellow').nullable().defaultTo(null);
  });

  await knex.schema.alterTable('readings', (t) => {
    t.smallint('toner_black').nullable().defaultTo(null);
    t.smallint('toner_cyan').nullable().defaultTo(null);
    t.smallint('toner_magenta').nullable().defaultTo(null);
    t.smallint('toner_yellow').nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('readings', (t) => {
    t.dropColumn('toner_black');
    t.dropColumn('toner_cyan');
    t.dropColumn('toner_magenta');
    t.dropColumn('toner_yellow');
  });

  await knex.schema.alterTable('devices', (t) => {
    t.dropColumn('toner_black');
    t.dropColumn('toner_cyan');
    t.dropColumn('toner_magenta');
    t.dropColumn('toner_yellow');
  });
}
