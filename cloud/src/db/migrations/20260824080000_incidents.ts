import type { Knex } from "knex";

/**
 * Fase 11 del gap analysis vs HP SDS — módulo de incidentes. Frontera con
 * `alerts` (deliberada, ver `docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md`):
 * una alerta es estado técnico crudo, la abre/cierra la máquina y se
 * auto-resuelve sola (única escritura: `alertService.ts`). Un incidente es
 * una unidad de trabajo de servicio — la abre/cierra una persona o una regla
 * opt-in, tiene número legible/SLA/aging, y SOBREVIVE a que la alerta
 * subyacente se auto-resuelva. Cerrar un incidente nunca resuelve alertas y
 * viceversa; se vinculan por `incident_alerts`, nunca por FK directa en
 * `alerts` (esa tabla sigue siendo propiedad exclusiva de `alertService.ts`).
 *
 * `device_serial`/`device_label` son snapshot denormalizado (mismo criterio
 * que `report_closure_lines`): un incidente ya cerrado no debe cambiar de
 * aspecto si el equipo se renombra o se fusiona después.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("incidents");
  if (hasTable) return;

  await knex.raw(`CREATE SEQUENCE incidents_number_seq START 100000`);

  await knex.schema.createTable("incidents", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.bigInteger("number").notNullable().unique().defaultTo(knex.raw("nextval('incidents_number_seq')"));
    t.string("external_id", 100).nullable();
    t.uuid("client_id").notNullable().references("id").inTable("clients").onDelete("CASCADE");
    t.uuid("device_id").nullable().references("id").inTable("devices").onDelete("SET NULL");
    t.uuid("agent_id").nullable().references("id").inTable("agents").onDelete("SET NULL");
    t.string("device_serial", 255).nullable();
    t.string("device_label", 255).nullable();
    t.string("class", 50).notNullable();
    t.string("title", 200).notNullable();
    t.text("description").nullable();
    t.text("severity").notNullable();
    t.text("status").notNullable().defaultTo("open");
    t.text("origin").notNullable();
    t.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("first_response_at", { useTz: true }).nullable();
    t.timestamp("sla_due_at", { useTz: true }).nullable();
    t.timestamp("closed_at", { useTz: true }).nullable();
    t.uuid("closed_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.text("close_reason").nullable();
    t.integer("reopened_count").notNullable().defaultTo(0);
    t.uuid("assigned_to").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`ALTER TABLE incidents ADD CONSTRAINT incidents_severity_check CHECK (severity IN ('warning','critical'))`);
  await knex.raw(`ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('open','in_progress','on_hold','closed'))`);
  await knex.raw(`ALTER TABLE incidents ADD CONSTRAINT incidents_origin_check CHECK (origin IN ('auto','manual'))`);
  await knex.raw(`ALTER TABLE incidents ADD CONSTRAINT incidents_close_coherent_check CHECK ((status = 'closed') = (closed_at IS NOT NULL))`);

  // Anti-duplicado de incidentes AUTOMÁTICOS — mismo patrón que
  // `alerts_device_type_open_uniq`: 5 apariciones del mismo (equipo, clase)
  // terminan en un ticket, no en 5. Manuales quedan fuera a propósito (un
  // operador puede querer abrir dos incidentes manuales sobre el mismo
  // equipo/clase, ej. dos visitas técnicas distintas).
  await knex.raw(`
    CREATE UNIQUE INDEX incidents_open_device_class_uniq ON incidents (device_id, class)
      WHERE status <> 'closed' AND device_id IS NOT NULL AND origin = 'auto'
  `);
  await knex.raw(`CREATE INDEX incidents_client_status_idx ON incidents (client_id, status, opened_at DESC)`);
  await knex.raw(`CREATE INDEX incidents_open_idx ON incidents (opened_at) WHERE status <> 'closed'`);

  await knex.schema.createTable("incident_alerts", (t) => {
    t.uuid("incident_id").notNullable().references("id").inTable("incidents").onDelete("CASCADE");
    t.integer("alert_id").notNullable().references("id").inTable("alerts").onDelete("CASCADE");
    t.timestamp("linked_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid("linked_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.primary(["incident_id", "alert_id"]);
  });
  await knex.raw(`CREATE INDEX incident_alerts_alert_id_idx ON incident_alerts (alert_id)`);

  await knex.schema.createTable("incident_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("incident_id").notNullable().references("id").inTable("incidents").onDelete("CASCADE");
    t.text("kind").notNullable();
    t.text("body").nullable();
    t.jsonb("metadata").nullable();
    t.uuid("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE incident_events ADD CONSTRAINT incident_events_kind_check
    CHECK (kind IN ('comment','status_change','assign','link_alert','unlink_alert','external_id','reopen','sla_breached'))`);
  await knex.raw(`CREATE INDEX incident_events_incident_id_idx ON incident_events (incident_id, created_at)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incident_events");
  await knex.schema.dropTableIfExists("incident_alerts");
  await knex.schema.dropTableIfExists("incidents");
  await knex.raw(`DROP SEQUENCE IF EXISTS incidents_number_seq`);
}
