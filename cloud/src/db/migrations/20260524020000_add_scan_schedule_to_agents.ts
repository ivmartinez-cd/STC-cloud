import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.jsonb("scan_schedule").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("scan_schedule");
  });
}
