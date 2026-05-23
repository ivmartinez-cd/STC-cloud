import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_feedback", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.enum("type", ["bug", "enhancement"]).notNullable();
    table.string("title", 200).notNullable();
    table.text("description").notNullable();
    table.string("image_url", 500).nullable();
    table.enum("status", ["open", "in_progress", "closed"]).notNullable().defaultTo("open");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_feedback");
}
