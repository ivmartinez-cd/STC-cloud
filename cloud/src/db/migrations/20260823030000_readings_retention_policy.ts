import type { Knex } from 'knex';

/**
 * Cierra el punto que la migración de reconciliación (20260821200000) dejó
 * explícitamente pendiente ("no se agrega política de retención/borrado — es
 * una decisión de negocio"): purga automática de `readings` crudo más allá de
 * 24 meses vía `add_retention_policy` nativo de TimescaleDB. Ventana
 * confirmada con el usuario — no hay ningún requisito legal/contractual que
 * la fije, y `report_closures` (snapshots inmutables) no dependen de que
 * `readings` crudo persista indefinidamente.
 *
 * `alerts`/`agent_logs` NO son hypertables (no pueden usar esta función
 * nativa) — su purga vive en `cloud/src/jobs/retentionJob.ts` como un DELETE
 * periódico app-level. `audit_logs` queda sin purga (trail de auditoría,
 * write-only, decisión explícita de no purgarlo).
 */
export async function up(knex: Knex): Promise<void> {
  const { rows } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.jobs WHERE hypertable_name = 'readings' AND proc_name = 'policy_retention'`
  );
  if (rows.length === 0) {
    await knex.raw(`SELECT add_retention_policy('readings', INTERVAL '24 months')`);
  }

  // Query de purga de `alerts` filtra por `resolved` + `resolved_at` — no había
  // ningún índice cubriendo esa combinación (sólo `alerts_created_at_idx`).
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS alerts_resolved_resolved_at_idx ON alerts (resolved, resolved_at)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS alerts_resolved_resolved_at_idx`);

  const { rows } = await knex.raw(
    `SELECT 1 FROM timescaledb_information.jobs WHERE hypertable_name = 'readings' AND proc_name = 'policy_retention'`
  );
  if (rows.length > 0) {
    await knex.raw(`SELECT remove_retention_policy('readings')`);
  }
}
