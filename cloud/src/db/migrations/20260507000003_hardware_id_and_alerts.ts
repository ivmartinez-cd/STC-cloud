import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // hardware_id para identificar el equipo donde corre el agente
  await knex.schema.alterTable("agents", (table) => {
    table.string("hardware_id", 255).nullable();
  });

  // contact_email para la tabla de clientes (usado en el portal)
  await knex.schema.alterTable("clients", (table) => {
    table.string("contact_email", 255).nullable();
  });

  // Tabla de alertas activas/resueltas
  await knex.schema.createTable("alerts", (table) => {
    table.increments("id").primary();
    table.uuid("device_id").references("id").inTable("devices").onDelete("CASCADE");
    table
      .enu("type", ["toner_low", "toner_critical", "device_error", "agent_offline"])
      .notNullable();
    table.enu("severity", ["warning", "critical"]).notNullable();
    table.text("message");
    table.integer("value"); // valor que disparó la alerta (ej: % toner)
    table.boolean("resolved").defaultTo(false);
    table.timestamp("resolved_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("alerts");
  await knex.schema.alterTable("clients", (table) => {
    table.dropColumn("contact_email");
  });
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("hardware_id");
  });
}
