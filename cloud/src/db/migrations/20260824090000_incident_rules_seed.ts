import type { Knex } from "knex";

/**
 * Fase 11 del gap analysis vs HP SDS — reglas de auto-creación de
 * incidentes. `enabled=false` en TODAS las filas sembradas: opt-in
 * explícito, cero incidentes automáticos al desplegar esto (garantía de
 * compatibilidad — ver `incidents.test.ts`). `client_id NULL` = regla
 * global, un cliente puede sobreescribirla con su propia fila para la misma
 * `class` (ver `incident_rules_scope_class_uniq`, que usa el mismo patrón de
 * "nil uuid como comodín" que `custom_field_defs_scope_key_uniq` de la Fase 4).
 */
const GLOBAL_CLASSES = [
  "consumable_out", "system_failure", "jam", "availability",
  "subunit_out", "media_out", "user_action", "system_change",
];

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("incident_rules");
  if (hasTable) return;

  await knex.schema.createTable("incident_rules", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("CASCADE");
    t.string("class", 50).notNullable();
    t.boolean("enabled").notNullable().defaultTo(false);
    t.text("min_severity").notNullable().defaultTo("critical");
    t.integer("delay_minutes").notNullable().defaultTo(0);
    t.integer("sla_hours").nullable();
    t.boolean("auto_close_on_alerts_resolved").notNullable().defaultTo(false);
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE incident_rules ADD CONSTRAINT incident_rules_min_severity_check
    CHECK (min_severity IN ('warning','critical'))`);
  await knex.raw(`
    CREATE UNIQUE INDEX incident_rules_scope_class_uniq ON incident_rules
      (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), class)
  `);

  for (const klass of GLOBAL_CLASSES) {
    await knex("incident_rules").insert({ client_id: null, class: klass, enabled: false });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incident_rules");
}
