import type { Knex } from "knex";

/**
 * Fase 4.6 del gap analysis vs HP SDS (re-comparación 24/08/2026): acciones
 * remotas en bloque — el "Acciones de HP SDS en bloque" del SDS (lotes
 * programados con nº, fecha, elementos, acción, enviado por y estado,
 * incluido "Completado con errores").
 *
 * Se apoya en la infraestructura de comandos EXISTENTE (`agent_commands` +
 * entrega por heartbeat + ack con success/error): un lote agrupa N comandos
 * ya soportados por el agente 1.1.0 (RESCAN, FORCE_SCAN, RESTART del
 * agente, FORCE_UPDATE) y les da programación + seguimiento agregado. El
 * reinicio remoto de la IMPRESORA (no del agente) requiere capacidad nueva
 * del agente y queda documentado como pendiente de release — ver el doc.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable("remote_action_batches");
  if (has) return;

  await knex.schema.createTable("remote_action_batches", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    // Nº legible de lote, como el SDS (2380, 2381...).
    t.specificType("number", "bigint GENERATED ALWAYS AS IDENTITY (START WITH 1000)");
    t.text("action").notNullable();
    t.string("name", 120).nullable();
    t.timestamp("scheduled_at", { useTz: true }).notNullable();
    t.text("status").notNullable().defaultTo("scheduled");
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("completed_at", { useTz: true }).nullable();
  });

  await knex.raw(`
    ALTER TABLE remote_action_batches
      ADD CONSTRAINT remote_action_batches_action_check CHECK (action IN
        ('RESCAN','FORCE_SCAN','RESTART','FORCE_UPDATE')),
      ADD CONSTRAINT remote_action_batches_status_check CHECK (status IN
        ('scheduled','sent','completed','completed_with_errors','cancelled'))
  `);
  await knex.raw(`
    CREATE INDEX remote_action_batches_due_idx ON remote_action_batches (scheduled_at)
      WHERE status = 'scheduled'
  `);
  await knex.raw(`
    CREATE INDEX remote_action_batches_open_idx ON remote_action_batches (status)
      WHERE status = 'sent'
  `);

  await knex.schema.createTable("remote_action_items", (t) => {
    t.uuid("batch_id").notNullable().references("id").inTable("remote_action_batches").onDelete("CASCADE");
    t.uuid("agent_id").notNullable().references("id").inTable("agents").onDelete("CASCADE");
    t.uuid("command_id").nullable().references("id").inTable("agent_commands").onDelete("SET NULL");
    t.primary(["batch_id", "agent_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("remote_action_items");
  await knex.schema.dropTableIfExists("remote_action_batches");
}
