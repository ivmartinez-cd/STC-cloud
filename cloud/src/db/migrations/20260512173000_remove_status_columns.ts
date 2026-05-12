import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Eliminar columnas de estado que ya no se usan
  if (await knex.schema.hasColumn("devices", "last_status")) {
    await knex.schema.alterTable("devices", (table) => {
      table.dropColumn("last_status");
    });
  }

  if (await knex.schema.hasColumn("readings", "status")) {
    await knex.schema.alterTable("readings", (table) => {
      table.dropColumn("status");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Por si hay que volver atrás
  await knex.schema.alterTable("devices", (table) => {
    table.string("last_status", 50);
  });

  await knex.schema.alterTable("readings", (table) => {
    table.string("status", 50);
  });
}
