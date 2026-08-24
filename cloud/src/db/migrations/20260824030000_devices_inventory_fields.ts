import type { Knex } from "knex";

/**
 * Fase 4 del gap analysis vs HP SDS — campos de inventario manuales y
 * derivados (Nº de activo, Nº de etiqueta, ciclos de trabajo, uso de 30 días,
 * campos personalizados por cliente).
 *
 * `asset_number` sigue el mismo patrón `*_reported`/`*_override`/columna
 * GENERADA que `name`/`location` (ver `20260822030000_devices_client_id_and_lifecycle.ts`):
 * la ingesta escribe `asset_number_reported` (hoy nadie lo llena — HP
 * FutureSmart EWS expone `AssetNumber` pero el agente todavía no lo captura,
 * es la Fase 10 de este roadmap), el portal escribe `asset_number_override`,
 * y `asset_number` es `COALESCE` de los dos. Un `UPDATE` directo sobre la
 * columna generada falla ruidosamente a propósito — mismo criterio que
 * `name`/`location`.
 *
 * `asset_tag` es columna plana: NINGUNA fuente automática lo reporta hoy (no
 * está en Printer-MIB ni en ninguna EWS parseada) — si algún día se captura,
 * migrar al patrón `*_reported`/`*_override` de arriba.
 *
 * `duty_cycle_monthly_override`: el ciclo de trabajo es spec del MODELO
 * (datasheet), no de la unidad — de ahí la tabla `device_models` aparte en
 * vez de otra columna en `devices`. El override por equipo cubre el caso de
 * un modelo no catalogado o un dato de fábrica corregido a mano.
 *
 * `custom_data` como jsonb en la fila (no EAV/tabla de valores aparte): cero
 * joins en los listados existentes, filtrable con GIN. El costo es que
 * archivar una `custom_field_defs` deja la clave huérfana en `custom_data` de
 * cualquier equipo que ya la tuviera seteada — inofensivo (el portal sólo
 * itera las definiciones vivas), la validación de tipo vive en
 * `customFieldService.ts` al escribir, no en la base.
 */
export async function up(knex: Knex): Promise<void> {
  const hasAssetNumber = await knex.schema.hasColumn("devices", "asset_number_reported");
  if (!hasAssetNumber) {
    await knex.schema.alterTable("devices", (t) => {
      t.string("asset_number_reported", 64).nullable();
      t.string("asset_number_override", 64).nullable();
      t.string("asset_tag", 64).nullable();
      t.integer("duty_cycle_monthly_override").nullable();
      t.jsonb("custom_data").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    });
    await knex.raw(`
      ALTER TABLE devices ADD COLUMN asset_number varchar(64)
        GENERATED ALWAYS AS (COALESCE(asset_number_override, asset_number_reported)) STORED
    `);
    await knex.raw(`
      ALTER TABLE devices ADD CONSTRAINT devices_duty_cycle_override_positive_check
        CHECK (duty_cycle_monthly_override IS NULL OR duty_cycle_monthly_override > 0)
    `);
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS devices_custom_data_gin ON devices USING gin (custom_data jsonb_path_ops)
  `);
  // NO único a propósito: un tipeo duplicado de número de etiqueta no debe
  // devolver 500 al operador — el portal avisa si quiere, la base no bloquea.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS devices_client_asset_tag_idx ON devices (client_id, upper(btrim(asset_tag)))
      WHERE asset_tag IS NOT NULL
  `);

  const hasDeviceModels = await knex.schema.hasTable("device_models");
  if (!hasDeviceModels) {
    await knex.schema.createTable("device_models", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.string("brand", 100).notNullable();
      // Normalizado (lower/trim de `model`) — es la clave real de matching contra
      // `devices.model`; `display_name` es lo que se muestra en el portal.
      t.string("model_key", 255).notNullable();
      t.string("display_name", 255).nullable();
      t.integer("duty_cycle_monthly").nullable();
      t.integer("recommended_volume_monthly").nullable();
      t.boolean("is_color").nullable();
      t.text("notes").nullable();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`
      CREATE UNIQUE INDEX device_models_brand_model_uniq ON device_models (lower(brand), model_key)
    `);
  }

  const hasCustomFieldDefs = await knex.schema.hasTable("custom_field_defs");
  if (!hasCustomFieldDefs) {
    await knex.schema.createTable("custom_field_defs", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      // NULL = definición global (visible para todos los clientes).
      t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("CASCADE");
      // Slug inmutable — es la clave dentro de devices.custom_data. `type`
      // también inmutable (cambiar el tipo de un campo con valores ya
      // guardados dejaría datos con la forma vieja) — se hace explícito en
      // customFieldService.ts, no hay CHECK que lo exprese acá.
      t.string("key", 64).notNullable();
      t.string("label", 100).notNullable();
      t.string("type", 16).notNullable();
      t.jsonb("options").nullable();
      t.integer("position").notNullable().defaultTo(0);
      t.timestamp("archived_at", { useTz: true }).nullable();
      t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`
      ALTER TABLE custom_field_defs ADD CONSTRAINT custom_field_defs_type_check
        CHECK (type IN ('text','number','date','select','boolean'))
    `);
    // Único por (scope, key) entre las vivas — COALESCE a un uuid nil para que
    // NULL (global) participe del índice único (dos NULL no colisionan en un
    // índice normal, sí necesitan este truco).
    await knex.raw(`
      CREATE UNIQUE INDEX custom_field_defs_scope_key_uniq ON custom_field_defs
        (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(key))
        WHERE archived_at IS NULL
    `);
  }

  // Uso de 30 días (ventana móvil, NO el mes calendario que ya calcula
  // `getAgentDevices`) — sobre `readings_daily_agg` (migración
  // `20260823050000`), nunca sobre `readings` crudo. Mismo criterio anti-reset
  // que `dashboardController.monthlyVolume`: SUM(GREATEST(delta,0)) sobre
  // LAG(), nunca MAX-MIN (un counter_reset en la ventana daría un número
  // negativo o inflado). Ventana interna de 32 días para que el primer día
  // de la ventana de 30 tenga base (LAG necesita el día anterior).
  await knex.raw(`
    CREATE OR REPLACE VIEW device_usage_30d AS
    SELECT device_id,
           SUM(GREATEST(d_total, 0))::bigint AS pages_30d,
           SUM(GREATEST(d_mono,  0))::bigint AS mono_30d,
           SUM(GREATEST(d_color, 0))::bigint AS color_30d
    FROM (
      SELECT device_id, day,
             total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY day) AS d_total,
             mono_pages  - LAG(mono_pages)  OVER (PARTITION BY device_id ORDER BY day) AS d_mono,
             color_pages - LAG(color_pages) OVER (PARTITION BY device_id ORDER BY day) AS d_color
      FROM readings_daily_agg
      WHERE day >= now() - INTERVAL '32 days'
    ) s
    WHERE day >= now() - INTERVAL '30 days'
    GROUP BY device_id
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW IF EXISTS device_usage_30d`);
  await knex.schema.dropTableIfExists("custom_field_defs");
  await knex.schema.dropTableIfExists("device_models");
  await knex.raw(`DROP INDEX IF EXISTS devices_client_asset_tag_idx`);
  await knex.raw(`DROP INDEX IF EXISTS devices_custom_data_gin`);
  const hasAssetNumber = await knex.schema.hasColumn("devices", "asset_number_reported");
  if (hasAssetNumber) {
    await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_duty_cycle_override_positive_check`);
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("asset_number");
      t.dropColumn("custom_data");
      t.dropColumn("duty_cycle_monthly_override");
      t.dropColumn("asset_tag");
      t.dropColumn("asset_number_override");
      t.dropColumn("asset_number_reported");
    });
  }
}
