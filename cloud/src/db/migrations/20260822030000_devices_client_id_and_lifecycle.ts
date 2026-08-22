import type { Knex } from "knex";

/**
 * Fase A (expand) de "identidad de dispositivo por cliente + ciclo de vida"
 * (docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md §2.4). Migración puramente
 * ADITIVA: no toca `devices_agent_serial_unique` ni crea ningún índice único
 * nuevo — eso ocurre recién en la migración de dedupe, después de que
 * `agentService.registerDevices` deje de depender de `ON CONFLICT (agent_id,
 * serial_number)`. Ver esa migración para el porqué del orden.
 *
 * En Render las migraciones corren en el `buildCommand`, separadas del
 * `startCommand` (la instancia vieja sigue sirviendo durante el build) — todas
 * las columnas nuevas son NULLABLE a propósito para no romper el código viejo
 * que sigue insertando en `devices` sin ellas durante esa ventana.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. client_id: hoy el cliente se deriva con el doble salto
  //    devices.agent_id -> agents.client_id en ~35 lugares. Backfill inmediato
  //    para que el resto de esta migración (y el código de la fase siguiente)
  //    lo pueda asumir poblado.
  const hasClientId = await knex.schema.hasColumn("devices", "client_id");
  if (!hasClientId) {
    await knex.schema.alterTable("devices", (t) => {
      t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("CASCADE");
    });
  }
  await knex.raw(`
    UPDATE devices d SET client_id = a.client_id
      FROM agents a WHERE a.id = d.agent_id AND d.client_id IS DISTINCT FROM a.client_id
  `);

  // 2. Techo duro anti-flapping: el matcher nuevo sólo puede re-apuntar
  //    agent_id una vez cada 24hs (ver deviceIdentity.ts), sin depender de que
  //    un umbral de "stale" esté bien calibrado.
  const hasReassigned = await knex.schema.hasColumn("devices", "agent_reassigned_at");
  if (!hasReassigned) {
    await knex.schema.alterTable("devices", (t) => {
      t.timestamp("agent_reassigned_at", { useTz: true }).nullable();
    });
  }

  // 3. Baja (soft-delete). NO se reutiliza `active`: la ingesta lo pone en
  //    `true` en cada sync y `deleteOfflineDevices` lo usa como criterio de
  //    purga en duro — "dar de baja" con `active` sería programar la
  //    destrucción del historial.
  const hasDecommissioned = await knex.schema.hasColumn("devices", "decommissioned_at");
  if (!hasDecommissioned) {
    await knex.schema.alterTable("devices", (t) => {
      t.timestamp("decommissioned_at", { useTz: true }).nullable();
      t.uuid("decommissioned_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.text("decommission_reason").nullable();
    });
  }

  // 4. Fusión: LÁPIDA, nunca DELETE. `readings.device_id` y `alerts.device_id`
  //    son ON DELETE CASCADE y `report_closure_lines.device_id` es ON DELETE
  //    SET NULL (nulificaría líneas de cierres ya emitidos, sin error, y como
  //    los campos están denormalizados el CSV seguiría renderizando igual).
  //    Con lápida el perdedor sobrevive con `merged_into` apuntando al
  //    superviviente — reversible, sin tocar chunks comprimidos de `readings`.
  const hasMergedInto = await knex.schema.hasColumn("devices", "merged_into");
  if (!hasMergedInto) {
    await knex.schema.alterTable("devices", (t) => {
      t.uuid("merged_into").nullable().references("id").inTable("devices").onDelete("SET NULL");
      t.timestamp("merged_at", { useTz: true }).nullable();
      t.uuid("merged_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    });
  }

  // 5. Overrides manuales de nombre/ubicación vía columna GENERADA, no un flag
  //    que la ingesta consulte. Con un flag, 0 sitios de escritura nuevos pero
  //    el modo de falla es silencioso: un camino de ingesta futuro que se
  //    olvide de consultarlo borra la edición del operador en el próximo scan.
  //    Con `custom_*` + COALESCE en lectura, conserva el valor pero obliga a
  //    tocar los ~8 sitios que hoy leen `devices.name`/`location`. La columna
  //    generada no toca NINGÚN sitio de lectura (devices.* ya trae el valor
  //    efectivo) y falla RUIDOSAMENTE: un futuro `update({name})` sobre
  //    `devices` tira `column "name" can only be updated to DEFAULT` en vez de
  //    pisar la edición en silencio.
  const hasNameReported = await knex.schema.hasColumn("devices", "name_reported");
  if (!hasNameReported) {
    await knex.schema.alterTable("devices", (t) => {
      t.renameColumn("name", "name_reported");
    });
    await knex.schema.alterTable("devices", (t) => {
      t.renameColumn("location", "location_reported");
    });
    await knex.schema.alterTable("devices", (t) => {
      t.string("name_override", 255).nullable();
      t.string("location_override", 255).nullable();
    });
    await knex.raw(`
      ALTER TABLE devices ADD COLUMN name varchar(255)
        GENERATED ALWAYS AS (COALESCE(name_override, name_reported)) STORED
    `);
    await knex.raw(`
      ALTER TABLE devices ADD COLUMN location varchar(255)
        GENERATED ALWAYS AS (COALESCE(location_override, location_reported)) STORED
    `);
  }

  // 6. Checks de coherencia.
  const { rows: mergeCheckRows } = await knex.raw(
    `SELECT 1 FROM pg_constraint WHERE conname = 'devices_merge_coherent_check'`
  );
  if (mergeCheckRows.length === 0) {
    await knex.raw(`
      ALTER TABLE devices ADD CONSTRAINT devices_merge_coherent_check
        CHECK ((merged_into IS NULL) = (merged_at IS NULL) AND (merged_into IS NULL OR merged_into <> id))
    `);
  }
  const { rows: decommCheckRows } = await knex.raw(
    `SELECT 1 FROM pg_constraint WHERE conname = 'devices_decommission_coherent_check'`
  );
  if (decommCheckRows.length === 0) {
    // Una lápida de fusión no se da de baja por separado: su estado lo hereda
    // el superviviente. Evita el estado ambiguo "fusionado Y dado de baja".
    await knex.raw(`
      ALTER TABLE devices ADD CONSTRAINT devices_decommission_coherent_check
        CHECK (decommissioned_at IS NULL OR merged_into IS NULL)
    `);
  }

  // 7. Índices NO únicos (el flip a único ocurre en la migración de dedupe).
  await knex.raw(`CREATE INDEX IF NOT EXISTS devices_client_id_idx ON devices (client_id)`);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS devices_client_serial_idx
      ON devices (client_id, serial_number) WHERE serial_number IS NOT NULL
  `);
  // MAC: deliberadamente NO único. `20260512142601_update_devices_constraints.ts`
  // ya revirtió un UNIQUE global de mac por romper el upsert; un segundo índice
  // único haría explotar el ON CONFLICT del primero con un 23505 de un índice
  // DISTINTO. El determinismo del matcher (Fase 2) lo garantiza el algoritmo
  // (corta si hay 2+ filas), no un constraint.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS devices_client_mac_idx
      ON devices (client_id, mac) WHERE mac IS NOT NULL
  `);
  await knex.raw(`CREATE INDEX IF NOT EXISTS devices_agent_ip_idx ON devices (agent_id, ip_address)`);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS devices_merged_into_idx ON devices (merged_into) WHERE merged_into IS NOT NULL
  `);

  // 8. Bitácora de colisiones que el dedupe automático no se anima a resolver
  //    solo (dos MACs o dos modelos distintos bajo el mismo serial) — fuente de
  //    la vista de duplicados del portal (GET /devices/duplicates).
  const hasCandidates = await knex.schema.hasTable("device_merge_candidates");
  if (!hasCandidates) {
    await knex.schema.createTable("device_merge_candidates", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("client_id").notNullable();
      t.string("serial_key", 255).notNullable();
      t.specificType("device_ids", "uuid[]").notNullable();
      t.text("reason").notNullable(); // 'multiple_macs' | 'multiple_models'
      t.timestamp("detected_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("resolved_at", { useTz: true }).nullable();
      t.uuid("resolved_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    });
    await knex.raw(`
      CREATE UNIQUE INDEX device_merge_candidates_open_uniq
        ON device_merge_candidates (client_id, serial_key) WHERE resolved_at IS NULL
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("device_merge_candidates");

  await knex.raw(`DROP INDEX IF EXISTS devices_merged_into_idx`);
  await knex.raw(`DROP INDEX IF EXISTS devices_agent_ip_idx`);
  await knex.raw(`DROP INDEX IF EXISTS devices_client_mac_idx`);
  await knex.raw(`DROP INDEX IF EXISTS devices_client_serial_idx`);
  await knex.raw(`DROP INDEX IF EXISTS devices_client_id_idx`);

  await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_decommission_coherent_check`);
  await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_merge_coherent_check`);

  const hasNameReported = await knex.schema.hasColumn("devices", "name_reported");
  if (hasNameReported) {
    await knex.raw(`ALTER TABLE devices DROP COLUMN IF EXISTS location`);
    await knex.raw(`ALTER TABLE devices DROP COLUMN IF EXISTS name`);
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("location_override");
      t.dropColumn("name_override");
    });
    await knex.schema.alterTable("devices", (t) => {
      t.renameColumn("location_reported", "location");
    });
    await knex.schema.alterTable("devices", (t) => {
      t.renameColumn("name_reported", "name");
    });
  }

  const hasMergedInto = await knex.schema.hasColumn("devices", "merged_into");
  if (hasMergedInto) {
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("merged_by");
      t.dropColumn("merged_at");
      t.dropColumn("merged_into");
    });
  }

  const hasDecommissioned = await knex.schema.hasColumn("devices", "decommissioned_at");
  if (hasDecommissioned) {
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("decommission_reason");
      t.dropColumn("decommissioned_by");
      t.dropColumn("decommissioned_at");
    });
  }

  const hasReassigned = await knex.schema.hasColumn("devices", "agent_reassigned_at");
  if (hasReassigned) {
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("agent_reassigned_at");
    });
  }

  const hasClientId = await knex.schema.hasColumn("devices", "client_id");
  if (hasClientId) {
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("client_id");
    });
  }
}
