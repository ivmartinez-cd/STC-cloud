import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Clientes
  await knex.schema.createTable("clients", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 255).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Agentes
  await knex.schema.createTable("agents", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("client_id").references("id").inTable("clients").onDelete("CASCADE");
    table.string("activation_key", 64).unique();
    table.string("jwt_secret", 128);
    table.string("name", 100);
    table.jsonb("ip_ranges"); // [{start:'10.0.1.1', end:'10.0.1.254'}]
    table.string("snmp_community", 64);
    table.timestamp("last_seen");
    table.string("status", 20).defaultTo("pending");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Dispositivos (Impresoras)
  await knex.schema.createTable("devices", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("agent_id").references("id").inTable("agents").onDelete("CASCADE");
    table.specificType("ip", "INET");
    table.specificType("mac", "MACADDR").unique();
    table.string("serial", 100);
    table.string("brand", 50);
    table.string("model", 100);
    table.string("name", 100);
    table.boolean("active").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  // Lecturas (TimescaleDB)
  await knex.schema.createTable("readings", (table) => {
    table.timestamp("time").notNullable();
    table.uuid("device_id").references("id").inTable("devices").onDelete("CASCADE");
    table.integer("total_pages");
    table.integer("mono_pages");
    table.integer("color_pages");
    table.smallint("toner_black");
    table.smallint("toner_cyan");
    table.smallint("toner_magenta");
    table.smallint("toner_yellow");
    table.string("status", 50);
    table.boolean("offline").defaultTo(false);
  });

  // Convert readings to hypertable (Requires TimescaleDB extension)
  await knex.raw("SELECT create_hypertable('readings', 'time')");
  await knex.raw("ALTER TABLE readings SET (timescaledb.compress)");
  await knex.raw("SELECT add_compression_policy('readings', INTERVAL '7 days')");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("readings");
  await knex.schema.dropTableIfExists("devices");
  await knex.schema.dropTableIfExists("agents");
  await knex.schema.dropTableIfExists("clients");
}
