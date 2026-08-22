import type { Knex } from "knex";

/**
 * Ciclo de vida de alertas (ack/resolve) + scoping a nivel agente, para poder abrir
 * alertas que no son de un dispositivo puntual (`agent_offline`).
 *
 * `alertWorker.ts` deduplica hoy con un SELECT-then-INSERT sin índice único — ya
 * produjo duplicados reales (mismo `device_id`+`type`, mismo segundo, confirmado en
 * el dump de producción). Los índices únicos parciales de abajo reemplazan eso por
 * un `ON CONFLICT DO NOTHING` real (ver `alertService.ts`). El dedupe defensivo antes
 * de crearlos es necesario porque la base productiva puede tener actividad más
 * reciente que el dump auditado (acá no se encontraron duplicados abiertos, pero la
 * migración no puede asumirlo).
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Dedupe defensivo de filas abiertas duplicadas por (device_id,type) y
  //    (agent_id,type) — se conserva la de menor id. `alerts.agent_id` todavía no
  //    existe en este punto, así que sólo aplica a device_id (agent_id no puede
  //    tener duplicados porque ninguna fila lo usa todavía).
  await knex.raw(`
    DELETE FROM alerts a USING alerts b
     WHERE a.resolved = false AND b.resolved = false
       AND a.device_id IS NOT NULL AND a.device_id = b.device_id
       AND a.type = b.type
       AND a.id > b.id
  `);

  // 2. `resolved` nullable sin filas NULL reales hoy, pero una fila NULL sería
  //    invisible tanto al filtro `?resolved=false` como al índice parcial nuevo
  //    (`WHERE resolved = false` no matchea NULL).
  await knex.raw(`UPDATE alerts SET resolved = false WHERE resolved IS NULL`);
  const hasResolvedNotNull = await knex.raw(`
    SELECT attnotnull FROM pg_attribute
     WHERE attrelid = 'alerts'::regclass AND attname = 'resolved'
  `);
  if (!hasResolvedNotNull.rows[0]?.attnotnull) {
    await knex.raw(`ALTER TABLE alerts ALTER COLUMN resolved SET NOT NULL`);
    await knex.raw(`ALTER TABLE alerts ALTER COLUMN resolved SET DEFAULT false`);
  }

  // 3. Scoping a nivel agente (agent_offline no tiene un device_id puntual).
  const hasAgentId = await knex.schema.hasColumn("alerts", "agent_id");
  if (!hasAgentId) {
    await knex.schema.alterTable("alerts", (t) => {
      t.uuid("agent_id").nullable().references("id").inTable("agents").onDelete("CASCADE");
    });
  }
  const { rows: scopeCheckRows } = await knex.raw(
    `SELECT 1 FROM pg_constraint WHERE conname = 'alerts_device_or_agent_check'`
  );
  if (scopeCheckRows.length === 0) {
    await knex.raw(
      `ALTER TABLE alerts ADD CONSTRAINT alerts_device_or_agent_check
         CHECK (device_id IS NOT NULL OR agent_id IS NOT NULL)`
    );
  }

  // 4. Ciclo de vida: reconocer sin resolver (client_viewer no puede hacer ninguno
  //    de los dos — ver rolePolicy.ts — pero admin/operator sí, vía PUT /alerts/:id).
  const hasAcknowledged = await knex.schema.hasColumn("alerts", "acknowledged");
  if (!hasAcknowledged) {
    await knex.schema.alterTable("alerts", (t) => {
      t.boolean("acknowledged").notNullable().defaultTo(false);
      t.uuid("ack_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.timestamp("ack_at", { useTz: true }).nullable();
    });
  }

  // 5. Índices únicos parciales: uno por device_id, uno por agent_id (nunca ambos
  //    a la vez sobre la misma fila, por la CHECK de arriba, pero cada alerta usa
  //    uno solo de los dos como target de conflicto en `alertService.openAlert`).
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS alerts_device_type_open_uniq
      ON alerts (device_id, type) WHERE resolved = false AND device_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS alerts_agent_type_open_uniq
      ON alerts (agent_id, type) WHERE resolved = false AND agent_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS alerts_agent_type_open_uniq`);
  await knex.raw(`DROP INDEX IF EXISTS alerts_device_type_open_uniq`);
  const hasAcknowledged = await knex.schema.hasColumn("alerts", "acknowledged");
  if (hasAcknowledged) {
    await knex.schema.alterTable("alerts", (t) => {
      t.dropColumn("ack_at");
      t.dropColumn("ack_by");
      t.dropColumn("acknowledged");
    });
  }
  await knex.raw(`ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_device_or_agent_check`);
  const hasAgentId = await knex.schema.hasColumn("alerts", "agent_id");
  if (hasAgentId) {
    await knex.schema.alterTable("alerts", (t) => {
      t.dropColumn("agent_id");
    });
  }
}
