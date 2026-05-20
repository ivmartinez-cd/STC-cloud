import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (t) => {
    // Código comercial del cartucho (e.g. CLT-K506L, CE285A)
    t.string('cartridge_code_black',   50).nullable().defaultTo(null);
    t.string('cartridge_code_cyan',    50).nullable().defaultTo(null);
    t.string('cartridge_code_magenta', 50).nullable().defaultTo(null);
    t.string('cartridge_code_yellow',  50).nullable().defaultTo(null);
    // Número de serie CRUM / chip del cartucho
    t.string('cartridge_serial_black',   60).nullable().defaultTo(null);
    t.string('cartridge_serial_cyan',    60).nullable().defaultTo(null);
    t.string('cartridge_serial_magenta', 60).nullable().defaultTo(null);
    t.string('cartridge_serial_yellow',  60).nullable().defaultTo(null);
    // Capacidad declarada en páginas del cartucho instalado
    t.integer('cartridge_capacity_black').nullable().defaultTo(null);
    t.integer('cartridge_capacity_cyan').nullable().defaultTo(null);
    t.integer('cartridge_capacity_magenta').nullable().defaultTo(null);
    t.integer('cartridge_capacity_yellow').nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (t) => {
    t.dropColumn('cartridge_code_black');
    t.dropColumn('cartridge_code_cyan');
    t.dropColumn('cartridge_code_magenta');
    t.dropColumn('cartridge_code_yellow');
    t.dropColumn('cartridge_serial_black');
    t.dropColumn('cartridge_serial_cyan');
    t.dropColumn('cartridge_serial_magenta');
    t.dropColumn('cartridge_serial_yellow');
    t.dropColumn('cartridge_capacity_black');
    t.dropColumn('cartridge_capacity_cyan');
    t.dropColumn('cartridge_capacity_magenta');
    t.dropColumn('cartridge_capacity_yellow');
  });
}
