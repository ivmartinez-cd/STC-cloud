import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Eliminar la restricción de unicidad en MAC (causaba fallos en el upsert si el SN no coincidía)
  // En PostgreSQL, el nombre por defecto suele ser 'devices_mac_unique'
  try {
    await knex.schema.alterTable("devices", (table) => {
      table.dropUnique(["mac"]);
    });
  } catch (e) {
    console.warn("No se pudo eliminar la restricción de MAC (tal vez no existía con ese nombre)");
  }

  // 2. Aumentar longitud de columnas para soportar strings largos de Lexmark/Samsung
  await knex.schema.alterTable("devices", (table) => {
    table.string("name", 255).alter();
    table.string("model", 255).alter();
    table.string("serial_number", 150).alter(); // Un poco más por si acaso
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("devices", (table) => {
    table.string("name", 100).alter();
    table.string("model", 100).alter();
    table.string("serial_number", 100).alter();
    table.unique(["mac"]);
  });
}
