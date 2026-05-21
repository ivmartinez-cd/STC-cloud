import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("devices", (t) => {
    // Pages printed with current cartridge
    t.integer("cartridge_printed_black").nullable().defaultTo(null);
    t.integer("cartridge_printed_cyan").nullable().defaultTo(null);
    t.integer("cartridge_printed_magenta").nullable().defaultTo(null);
    t.integer("cartridge_printed_yellow").nullable().defaultTo(null);

    // Estimated pages remaining for current cartridge
    t.integer("cartridge_estimated_black").nullable().defaultTo(null);
    t.integer("cartridge_estimated_cyan").nullable().defaultTo(null);
    t.integer("cartridge_estimated_magenta").nullable().defaultTo(null);
    t.integer("cartridge_estimated_yellow").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("devices", (t) => {
    t.dropColumn("cartridge_printed_black");
    t.dropColumn("cartridge_printed_cyan");
    t.dropColumn("cartridge_printed_magenta");
    t.dropColumn("cartridge_printed_yellow");

    t.dropColumn("cartridge_estimated_black");
    t.dropColumn("cartridge_estimated_cyan");
    t.dropColumn("cartridge_estimated_magenta");
    t.dropColumn("cartridge_estimated_yellow");
  });
}
