import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.smallint("toner_warning_threshold").nullable().defaultTo(20);
    table.smallint("toner_critical_threshold").nullable().defaultTo(10);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("toner_warning_threshold");
    table.dropColumn("toner_critical_threshold");
  });
}
