import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_commands", (table) => {
    table.string("created_by").nullable(); // Nombre de usuario o ID del portal
    table.timestamp("sent_at").nullable(); // Cuándo se entregó al agente
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_commands", (table) => {
    table.dropColumn("created_by");
    table.dropColumn("sent_at");
  });
}
