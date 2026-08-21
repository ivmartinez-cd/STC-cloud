import type { Knex } from 'knex';

/**
 * Reconcilia el esquema real de `readings` (hypertable + compresión + supplies_details
 * aplicados a mano fuera de migraciones) con lo que produce `knex migrate:latest` desde
 * cero, y agrega `reading_id` + índices necesarios para idempotencia y performance.
 * Todos los pasos son guardados (chequean el estado actual antes de actuar) para poder
 * correr sin error tanto en una base ya reconciliada a mano como en una nueva.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. `readings.id` no existe en la base real (se eliminó a mano porque un PK que no
  //    incluye `time` bloquea create_hypertable). Un entorno nuevo migrado desde cero
  //    todavía la tiene: la eliminamos para igualar la realidad.
  const hasId = await knex.schema.hasColumn('readings', 'id');
  if (hasId) {
    await knex.schema.alterTable('readings', (t) => {
      t.dropColumn('id');
    });
  }

  // 2. `supplies_details` ya existe en la base real pero ninguna migración la crea en `readings`.
  const hasSupplies = await knex.schema.hasColumn('readings', 'supplies_details');
  if (!hasSupplies) {
    await knex.schema.alterTable('readings', (t) => {
      t.jsonb('supplies_details').nullable().defaultTo(null);
    });
  }

  // 3. Convertir a hypertable si todavía no lo es (ya lo es en la base real).
  const { rows: hypertableRows } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'readings'`
  );
  if (hypertableRows.length === 0) {
    await knex.raw(`SELECT create_hypertable('readings', 'time', migrate_data => true)`);
  }

  // 4. Habilitar compresión si todavía no está habilitada.
  const { rows: compressionRows } = await knex.raw(
    `SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'readings'`
  );
  if (!compressionRows[0]?.compression_enabled) {
    await knex.raw(
      `ALTER TABLE readings SET (timescaledb.compress, timescaledb.compress_orderby = 'time DESC')`
    );
  }

  // 5. Política de compresión (mismo valor ya aplicado en la base real: 7 días).
  //    No se agrega política de retención/borrado — es una decisión de negocio.
  const { rows: policyRows } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.jobs WHERE hypertable_name = 'readings' AND proc_name = 'policy_compression'`
  );
  if (policyRows.length === 0) {
    await knex.raw(`SELECT add_compression_policy('readings', INTERVAL '7 days')`);
  }

  // 6. `reading_id` para idempotencia de /devices/sync. Nullable: agentes ya desplegados
  //    que todavía no lo envíen siguen insertando igual que hoy (Postgres permite
  //    cualquier cantidad de NULL en una columna de un índice único).
  const hasReadingId = await knex.schema.hasColumn('readings', 'reading_id');
  if (!hasReadingId) {
    await knex.schema.alterTable('readings', (t) => {
      t.uuid('reading_id').nullable();
    });
  }

  // Índice único compuesto: TimescaleDB exige que un índice único de un hypertable
  // incluya la columna de partición (`time`).
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS readings_reading_id_time_unique ON readings (reading_id, time)`
  );

  // 7. Índices de performance señalados en el gap analysis.
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS readings_device_id_time_idx ON readings (device_id, time DESC)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS alerts_device_id_resolved_idx ON alerts (device_id, resolved)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS alerts_created_at_idx ON alerts (created_at)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS agents_client_id_idx ON agents (client_id)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS agents_client_id_idx`);
  await knex.raw(`DROP INDEX IF EXISTS audit_logs_created_at_idx`);
  await knex.raw(`DROP INDEX IF EXISTS alerts_created_at_idx`);
  await knex.raw(`DROP INDEX IF EXISTS alerts_device_id_resolved_idx`);
  await knex.raw(`DROP INDEX IF EXISTS readings_device_id_time_idx`);
  await knex.raw(`DROP INDEX IF EXISTS readings_reading_id_time_unique`);

  const hasReadingId = await knex.schema.hasColumn('readings', 'reading_id');
  if (hasReadingId) {
    await knex.schema.alterTable('readings', (t) => {
      t.dropColumn('reading_id');
    });
  }

  // El hypertable/compresión/supplies_details/drop de `id` no se revierten:
  // no son reversibles de forma segura sin riesgo de pérdida de datos.
}
