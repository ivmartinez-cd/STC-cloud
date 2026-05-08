import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("readings", (table) => {
    table.dropColumn("toner_black");
    table.dropColumn("toner_cyan");
    table.dropColumn("toner_magenta");
    table.dropColumn("toner_yellow");
  });

  // Eliminar alertas de tóner que ya no aplican
  await knex("alerts").whereIn("type", ["toner_low", "toner_critical"]).delete();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("readings", (table) => {
    table.smallint("toner_black").nullable();
    table.smallint("toner_cyan").nullable();
    table.smallint("toner_magenta").nullable();
    table.smallint("toner_yellow").nullable();
  });
}
