import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").nullable(); // ID del usuario del portal
    table.string("action", 100).notNullable(); // 'CREATE_AGENT', 'REVOKE_TOKEN', etc.
    table.string("target_id", 100).nullable(); // ID del agente o recurso afectado
    table.jsonb("metadata").nullable(); // Datos adicionales de la accion
    table.string("ip_address", 45).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_logs");
}
