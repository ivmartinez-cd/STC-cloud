import type { Knex } from "knex";

/**
 * Handoff hifi #3, fase 4 (26/08/2026): sin `rule_id` el diagnóstico de
 * "incidentes automáticos que cierran en 0 minutos" sólo puede señalar la
 * `class` (ej. "consumable_out"), no distinguir si el disparador fue la
 * regla global o el override propio de un cliente. Nullable — incidentes
 * manuales (`origin='manual'`) y los ya existentes antes de esta migración
 * quedan sin regla asociada; `incidentWorker.ts` lo completa desde acá en
 * adelante para los que abre automáticamente.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("incidents", "rule_id");
  if (hasColumn) return;
  await knex.schema.alterTable("incidents", (t) => {
    t.uuid("rule_id").nullable().references("id").inTable("incident_rules").onDelete("SET NULL");
  });
  await knex.raw(`CREATE INDEX incidents_rule_id_idx ON incidents (rule_id) WHERE rule_id IS NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS incidents_rule_id_idx`);
  await knex.schema.alterTable("incidents", (t) => {
    t.dropColumn("rule_id");
  });
}
