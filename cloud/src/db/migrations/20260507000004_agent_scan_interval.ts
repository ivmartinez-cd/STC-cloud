import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.integer("scan_interval_minutes").defaultTo(15).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("scan_interval_minutes");
  });
}
