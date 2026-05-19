import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("username", 100).notNullable().unique().index();
    table.string("password_hash", 255).notNullable();
    table.string("role", 50).notNullable().defaultTo("operator");
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamps(true, true); // created_at y updated_at automáticos
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users");
}
