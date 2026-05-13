import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Verificamos si la columna existe antes de añadirla para evitar errores
  const hasColumn = await knex.schema.hasColumn("agent_commands", "sent_at");
  if (!hasColumn) {
    await knex.schema.alterTable("agent_commands", (table) => {
      table.timestamp("sent_at").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agent_commands", (table) => {
    table.dropColumn("sent_at");
  });
}
