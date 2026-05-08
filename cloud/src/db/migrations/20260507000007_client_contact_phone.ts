import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("clients", (table) => {
    table.string("contact_phone", 50).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("clients", (table) => {
    table.dropColumn("contact_phone");
  });
}
