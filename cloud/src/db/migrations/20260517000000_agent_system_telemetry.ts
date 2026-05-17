import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.string("version", 50).nullable();
    table.string("host_name", 255).nullable();
    table.string("host_os", 255).nullable();
    table.string("host_ip", 50).nullable();
    table.string("uptime", 100).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("version");
    table.dropColumn("host_name");
    table.dropColumn("host_os");
    table.dropColumn("host_ip");
    table.dropColumn("uptime");
  });
}
