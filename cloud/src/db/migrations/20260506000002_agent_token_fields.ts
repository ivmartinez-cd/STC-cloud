import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    // Hash del refresh token (SHA-256 del token real, que se guarda solo en el agente)
    table.string("refresh_token_hash", 128).nullable();
    // TTL de 24h para la activation_key (sección 5.1 del PDF)
    table.timestamp("activation_expires_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("refresh_token_hash");
    table.dropColumn("activation_expires_at");
  });
}
