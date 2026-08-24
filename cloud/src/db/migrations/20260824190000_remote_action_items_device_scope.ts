import type { Knex } from "knex";

/**
 * Fase agente v1.2.0: soporte de destino por EQUIPO en los lotes de
 * acciones remotas (Fase 4.6). Las 4 acciones originales (RESCAN,
 * FORCE_SCAN, RESTART, FORCE_UPDATE) apuntan al AGENTE; la nueva
 * `RESTART_PRINTER` apunta a un equipo puntual dentro de la flota de ese
 * agente — el mismo agente puede monitorear varias impresoras.
 *
 * `device_id`/`device_ip` quedan NULL para las acciones de agente (sin
 * cambio de comportamiento); `device_ip` es un snapshot al crear el lote
 * (mismo criterio que `incidents.device_serial` — el payload que viaja al
 * agente necesita la IP en el momento del disparo, no la actual si cambió).
 * La PK compuesta original no soporta más de un item por agente en un
 * mismo lote — se reemplaza por `id` surrogate + índice único que trata
 * NULL como un valor más (COALESCE contra un UUID nil, mismo patrón que
 * `message_templates_scope_event_uniq`).
 */
export async function up(knex: Knex): Promise<void> {
  const hasDeviceId = await knex.schema.hasColumn("remote_action_items", "device_id");
  if (hasDeviceId) return;

  await knex.raw(`ALTER TABLE remote_action_items DROP CONSTRAINT remote_action_items_pkey`);
  await knex.schema.alterTable("remote_action_items", (t) => {
    t.uuid("id").defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("device_id").nullable().references("id").inTable("devices").onDelete("SET NULL");
    t.string("device_ip", 45).nullable();
  });
  await knex.raw(`ALTER TABLE remote_action_items ADD PRIMARY KEY (id)`);
  await knex.raw(`
    CREATE UNIQUE INDEX remote_action_items_batch_target_uniq
      ON remote_action_items (batch_id, agent_id, COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid))
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasDeviceId = await knex.schema.hasColumn("remote_action_items", "device_id");
  if (!hasDeviceId) return;
  await knex.raw(`DROP INDEX IF EXISTS remote_action_items_batch_target_uniq`);
  await knex.raw(`ALTER TABLE remote_action_items DROP CONSTRAINT remote_action_items_pkey`);
  await knex.schema.alterTable("remote_action_items", (t) => {
    t.dropColumn("id");
    t.dropColumn("device_id");
    t.dropColumn("device_ip");
  });
  await knex.raw(`ALTER TABLE remote_action_items ADD PRIMARY KEY (batch_id, agent_id)`);
}
