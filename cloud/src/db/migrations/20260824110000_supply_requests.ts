import type { Knex } from "knex";

/**
 * Fase 4.2 del gap analysis vs HP SDS (re-comparación 24/08/2026): ciclo de
 * pedidos de consumibles — el módulo "Gestión de consumibles" del SDS es un
 * pipeline de SOLICITUDES (pendiente/consultada/procesada/completada/
 * ignorada/eliminada), no una vista de niveles. Este es el dominio que hoy
 * resuelve `sdsinsumos` contra el SDS.
 *
 * Decisiones:
 * - Opt-in por cliente (`clients.supply_requests_enabled`, default false —
 *   cero pedidos automáticos al desplegar, mismo criterio que
 *   `incident_rules.enabled=false` de la Fase 11).
 * - Anti-duplicado de pedidos AUTOMÁTICOS por (equipo, consumible) vía
 *   índice único parcial, mismo patrón que `incidents_open_device_class_uniq`.
 *   `supply_key` es la clave estable del row de consumible que ya genera
 *   `suppliesService.buildSupplyRows` (kind+color+descripción normalizada).
 * - "Eliminada" del SDS se mapea a estado `cancelled` — acá no se borran
 *   filas (historial permanente, igual que incidentes).
 * - Un pedido cerrado NO se reabre: si el consumible sigue bajo el umbral
 *   en el próximo tick del worker, se abre un pedido nuevo (más simple y
 *   más honesto que la semántica de reapertura).
 */
export async function up(knex: Knex): Promise<void> {
  const hasEnabled = await knex.schema.hasColumn("clients", "supply_requests_enabled");
  if (!hasEnabled) {
    await knex.schema.alterTable("clients", (t) => {
      t.boolean("supply_requests_enabled").notNullable().defaultTo(false);
      t.integer("supply_request_threshold_pct").notNullable().defaultTo(10);
    });
    await knex.raw(`
      ALTER TABLE clients ADD CONSTRAINT clients_supply_threshold_check
        CHECK (supply_request_threshold_pct BETWEEN 1 AND 99)
    `);
  }

  const hasTable = await knex.schema.hasTable("supply_requests");
  if (hasTable) return;

  await knex.schema.createTable("supply_requests", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("client_id").notNullable().references("id").inTable("clients").onDelete("CASCADE");
    t.uuid("device_id").nullable().references("id").inTable("devices").onDelete("SET NULL");
    // Snapshot denormalizado, mismo criterio que incidents/report_closure_lines.
    t.string("device_serial", 255).nullable();
    t.string("device_label", 255).nullable();
    t.string("supply_key", 120).notNullable();
    t.string("supply_kind", 30).notNullable();
    t.string("supply_color", 20).nullable();
    t.string("description", 200).nullable();
    t.string("sku", 100).nullable();
    t.integer("level_pct").nullable();
    t.integer("remaining_days").nullable();
    t.text("status").notNullable().defaultTo("pending");
    t.text("origin").notNullable();
    t.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("closed_at", { useTz: true }).nullable();
    t.text("notes").nullable();
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE supply_requests
      ADD CONSTRAINT supply_requests_status_check CHECK (status IN
        ('pending','reviewed','processed','completed','ignored','cancelled')),
      ADD CONSTRAINT supply_requests_origin_check CHECK (origin IN ('auto','manual')),
      ADD CONSTRAINT supply_requests_close_coherent_check CHECK (
        (status IN ('completed','ignored','cancelled')) = (closed_at IS NOT NULL))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX supply_requests_open_uniq
      ON supply_requests (device_id, supply_key)
      WHERE status IN ('pending','reviewed','processed')
        AND origin = 'auto' AND device_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX supply_requests_client_status_idx
      ON supply_requests (client_id, status, opened_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX supply_requests_open_idx
      ON supply_requests (opened_at)
      WHERE status IN ('pending','reviewed','processed')
  `);

  await knex.schema.createTable("supply_request_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("request_id").notNullable().references("id").inTable("supply_requests").onDelete("CASCADE");
    t.text("kind").notNullable();
    t.text("body").nullable();
    t.jsonb("metadata").nullable();
    t.uuid("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    ALTER TABLE supply_request_events
      ADD CONSTRAINT supply_request_events_kind_check CHECK (kind IN
        ('status_change','comment','auto_complete'))
  `);
  await knex.raw(`
    CREATE INDEX supply_request_events_request_idx
      ON supply_request_events (request_id, created_at)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("supply_request_events");
  await knex.schema.dropTableIfExists("supply_requests");
  const hasEnabled = await knex.schema.hasColumn("clients", "supply_requests_enabled");
  if (hasEnabled) {
    await knex.raw("ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_supply_threshold_check");
    await knex.schema.alterTable("clients", (t) => {
      t.dropColumn("supply_requests_enabled");
      t.dropColumn("supply_request_threshold_pct");
    });
  }
}
