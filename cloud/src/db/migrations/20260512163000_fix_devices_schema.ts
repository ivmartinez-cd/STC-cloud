import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Verificar si existe last_seen antes de entrar al bloque sincrónico
  const hasLastSeen = await knex.schema.hasColumn("devices", "last_seen");

  await knex.schema.alterTable("devices", (table) => {
    if (!hasLastSeen) {
      table.timestamp("last_seen").nullable();
    }

    // 2. Asegurar que los contadores sean bigInteger
    table.bigInteger("total_pages").alter();
    table.bigInteger("mono_pages").alter();
    table.bigInteger("color_pages").alter();
    
    // 3. Asegurar longitud del modelo y nombre
    table.string("model", 255).alter();
    table.string("name", 255).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("devices", (table) => {
    table.integer("total_pages").alter();
    table.integer("mono_pages").alter();
    table.integer("color_pages").alter();
    table.dropColumn("last_seen");
  });
}
