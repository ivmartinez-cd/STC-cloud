import type { Knex } from "knex";

/**
 * "Guardar vista" en Movimientos — cierre de gap post-verificación del
 * handoff hifi #3 (26/08/2026). Vistas personales del operador (no
 * compartidas entre usuarios, no hay selector de alcance en el mockup):
 * un preset con nombre de los filtros de `/activity` (rango, búsqueda,
 * segmento). `filters` en JSONB en vez de columnas propias porque el set
 * de filtros de Movimientos ya cambió de forma varias veces en este mismo
 * handoff — columnas fijas atarían el esquema a la forma actual del hook.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("activity_saved_views", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("name", 80).notNullable();
    table.jsonb("filters").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable("activity_saved_views", (table) => {
    table.index(["user_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("activity_saved_views");
}
