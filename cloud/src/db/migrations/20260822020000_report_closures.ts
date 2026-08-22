import type { Knex } from "knex";

/**
 * Cierre mensual inmutable por cliente/equipo. Nombre deliberadamente distinto de
 * `monthly_counters`: `deviceController.ts` tiene código defensivo
 * (`if (await trx.schema.hasTable("monthly_counters")) { await
 * trx("monthly_counters").where("device_id", id).del(); }`) apuntando a una tabla
 * que NINGUNA migración crea — es un fantasma del STC legado. Si esta tabla nueva
 * se llamara así, ese código la empezaría a borrar en cascada al eliminar
 * cualquier equipo, exactamente lo opuesto de "inmutable".
 *
 * `report_closures` es el header (un cierre = un cliente + un mes calendario);
 * `report_closure_lines` es el detalle por equipo. Las líneas denormalizan la
 * identidad del equipo/agente al momento del cierre — si el dispositivo se borra
 * después (hoy `deleteDevice` borra sus `readings` en cascada, sin soft-delete),
 * el cierre ya emitido no se altera ni desaparece.
 */
export async function up(knex: Knex): Promise<void> {
  const hasClosures = await knex.schema.hasTable("report_closures");
  if (!hasClosures) {
    await knex.schema.createTable("report_closures", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      // Primera excepción a "todo en cascada" de este esquema: un cliente con
      // historial de facturación cerrado no se puede borrar sin antes lidiar con
      // ese historial (a diferencia de agents/devices/readings, todos CASCADE).
      t.uuid("client_id").notNullable().references("id").inTable("clients").onDelete("RESTRICT");
      // Primer día del mes — granularidad mensual, coincide con "cierre MENSUAL".
      t.date("period").notNullable();
      t.string("status", 20).notNullable().defaultTo("closed"); // 'closed' | 'reopened'
      t.timestamp("closed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.uuid("closed_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.timestamp("reopened_at", { useTz: true }).nullable();
      t.uuid("reopened_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.text("reopen_reason").nullable();
      // Apunta al cierre NUEVO que reemplazó a este tras reabrirlo — nunca se
      // edita el cierre viejo en sí, sólo se lo marca 'reopened' y se linkea.
      t.uuid("superseded_by").nullable().references("id").inTable("report_closures").onDelete("SET NULL");
      t.bigInteger("total_pages").notNullable().defaultTo(0);
      t.bigInteger("total_mono").notNullable().defaultTo(0);
      t.bigInteger("total_color").notNullable().defaultTo(0);
    });
    // Índice único PARCIAL: sólo aplica a filas 'closed'. Reabrir un cierre
    // (status='reopened') libera el período para uno nuevo sin permitir dos
    // cierres 'closed' simultáneos del mismo (client_id, period).
    await knex.raw(`
      CREATE UNIQUE INDEX report_closures_client_period_open_uniq
        ON report_closures (client_id, period) WHERE status = 'closed'
    `);
    await knex.raw(`CREATE INDEX report_closures_client_id_idx ON report_closures (client_id)`);
  }

  const hasLines = await knex.schema.hasTable("report_closure_lines");
  if (!hasLines) {
    await knex.schema.createTable("report_closure_lines", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("closure_id").notNullable().references("id").inTable("report_closures").onDelete("CASCADE");
      // NUNCA cascade: si el equipo se borra después, la línea del cierre sobrevive.
      t.uuid("device_id").nullable().references("id").inTable("devices").onDelete("SET NULL");
      t.string("device_serial", 255).nullable();
      t.string("device_model", 255).nullable();
      t.string("device_brand", 100).nullable();
      t.uuid("agent_id").nullable().references("id").inTable("agents").onDelete("SET NULL");
      t.string("agent_name", 255).nullable();
      t.timestamp("first_reading_at", { useTz: true }).nullable();
      t.bigInteger("first_total_pages").nullable();
      t.bigInteger("first_mono_pages").nullable();
      t.bigInteger("first_color_pages").nullable();
      t.timestamp("last_reading_at", { useTz: true }).nullable();
      t.bigInteger("last_total_pages").nullable();
      t.bigInteger("last_mono_pages").nullable();
      t.bigInteger("last_color_pages").nullable();
      // Suma de deltas positivos lectura-a-lectura dentro del período (mismo
      // cálculo que dashboardController/getClientUsage/getAgentDevices) — NO
      // "last - first": un reset a mitad de mes daría un número negativo/erróneo.
      t.bigInteger("delta_total").notNullable().defaultTo(0);
      t.bigInteger("delta_mono").notNullable().defaultTo(0);
      t.bigInteger("delta_color").notNullable().defaultTo(0);
      // devices.poll_method congelado al cerrar — aproximado: es el método
      // actual del equipo, no necesariamente el de cada lectura individual
      // (`readings` no guarda método por fila).
      t.string("source", 20).nullable();
      // Cruzado contra `alerts` (type='counter_reset', created_at dentro del
      // período) — llena la columna "MOTIVO" que el CSV legado dejaba vacía.
      t.boolean("had_counter_reset").notNullable().defaultTo(false);
    });
    await knex.raw(`CREATE INDEX report_closure_lines_closure_id_idx ON report_closure_lines (closure_id)`);
    await knex.raw(`CREATE INDEX report_closure_lines_device_id_idx ON report_closure_lines (device_id)`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("report_closure_lines");
  await knex.raw(`DROP INDEX IF EXISTS report_closures_client_id_idx`);
  await knex.raw(`DROP INDEX IF EXISTS report_closures_client_period_open_uniq`);
  await knex.schema.dropTableIfExists("report_closures");
}
