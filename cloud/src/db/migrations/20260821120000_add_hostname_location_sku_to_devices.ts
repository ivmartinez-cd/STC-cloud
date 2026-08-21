import { Knex } from "knex";

/**
 * Datos de identidad que el agente ya envía en /devices/sync (hostname, location) y el SKU/número de
 * producto que viaja en supplies_details.device.sku — con columna propia para mostrarlos y filtrarlos
 * como hace HP SDS ("Nombre del host", "Ubicación", "SKU").
 */
export async function up(knex: Knex): Promise<void> {
  const has = async (c: string) => knex.schema.hasColumn("devices", c);
  if (!(await has("hostname"))) await knex.schema.alterTable("devices", (t) => { t.string("hostname", 100).nullable(); });
  if (!(await has("location"))) await knex.schema.alterTable("devices", (t) => { t.string("location", 255).nullable(); });
  if (!(await has("sku")))      await knex.schema.alterTable("devices", (t) => { t.string("sku", 50).nullable(); });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("devices", (t) => {
    t.dropColumn("hostname");
    t.dropColumn("location");
    t.dropColumn("sku");
  });
}
