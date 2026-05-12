import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("devices", (table) => {
    table.integer("total_pages");
    table.integer("mono_pages");
    table.integer("color_pages");
    table.string("last_status", 50);
  });

  // Renombrar columnas para coincidir con el portal y evitar confusiones
  // Nota: En PostgreSQL alterTable renameColumn es seguro
  await knex.schema.table("devices", (table) => {
    table.renameColumn("ip", "ip_address");
    table.renameColumn("serial", "serial_number");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table("devices", (table) => {
    table.renameColumn("ip_address", "ip");
    table.renameColumn("serial_number", "serial");
  });

  await knex.schema.alterTable("devices", (table) => {
    table.dropColumn("total_pages");
    table.dropColumn("mono_pages");
    table.dropColumn("color_pages");
    table.dropColumn("last_status");
  });
}
