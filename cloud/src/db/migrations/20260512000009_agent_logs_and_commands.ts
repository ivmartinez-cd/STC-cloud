import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Logs remotos de agentes
  await knex.schema.createTable("agent_logs", (table) => {
    table.increments("id").primary();
    table.uuid("agent_id").references("id").inTable("agents").onDelete("CASCADE").notNullable();
    table.string("level", 10).notNullable(); // INFO, WARN, ERROR, DEBUG
    table.text("message").notNullable();
    table.timestamp("timestamp").defaultTo(knex.fn.now());
    
    // Índice para búsqueda rápida por agente y tiempo
    table.index(["agent_id", "timestamp"]);
  });

  // Comandos remotos para agentes
  await knex.schema.createTable("agent_commands", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("agent_id").references("id").inTable("agents").onDelete("CASCADE").notNullable();
    table.string("type", 50).notNullable(); // RESCAN, PING, RESTART, etc.
    table.jsonb("payload").defaultTo("{}");
    table.string("status", 20).defaultTo("pending"); // pending, running, success, error
    table.jsonb("result").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("executed_at").nullable();
    
    table.index(["agent_id", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agent_commands");
  await knex.schema.dropTableIfExists("agent_logs");
}
