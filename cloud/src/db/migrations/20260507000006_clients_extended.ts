import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("clients", (table) => {
    table.string("contact_name", 100).nullable();
    table.string("address", 255).nullable();
    table.string("country", 100).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("clients", (table) => {
    table.dropColumn("contact_name");
    table.dropColumn("address");
    table.dropColumn("country");
  });
}
