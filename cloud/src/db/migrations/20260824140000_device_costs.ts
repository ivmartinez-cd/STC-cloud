import type { Knex } from "knex";

/**
 * Fase 4.5 del gap analysis vs HP SDS (re-comparación 24/08/2026): costes
 * por equipo — la pestaña "Costes" del detalle del SDS (coste de capital,
 * alquiler trimestral, coste por página mono/color, contrato de servicio).
 * En el SDS estos campos alimentan los "Extended Billing Figures", los
 * informes más usados por el equipo real (mayoría de los 55 configurados).
 *
 * Tabla 1:1 aparte (`device_costs`) en vez de columnas en `devices`:
 * `devices` ya es ancha, esto es data administrativa opcional que la carga
 * un operador — mismo criterio de separación que `incident_rules` respecto
 * de `clients`. Los importes por página usan numeric(10,4): un coste de
 * página real es del orden de $0,0227 (visto en el SDS), 2 decimales no
 * alcanzan.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable("device_costs");
  if (has) return;

  await knex.schema.createTable("device_costs", (t) => {
    t.uuid("device_id").primary().references("id").inTable("devices").onDelete("CASCADE");
    t.decimal("capital_cost", 12, 2).nullable();
    t.decimal("quarterly_rental", 12, 2).nullable();
    t.decimal("mono_page_cost", 10, 4).nullable();
    t.decimal("color_page_cost", 10, 4).nullable();
    t.decimal("service_contract_cost", 12, 2).nullable();
    t.integer("service_contract_years").nullable();
    t.string("currency", 3).notNullable().defaultTo("ARS");
    t.uuid("updated_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE device_costs
      ADD CONSTRAINT device_costs_years_check CHECK
        (service_contract_years IS NULL OR service_contract_years BETWEEN 1 AND 20),
      ADD CONSTRAINT device_costs_nonnegative_check CHECK (
        COALESCE(capital_cost, 0) >= 0 AND COALESCE(quarterly_rental, 0) >= 0 AND
        COALESCE(mono_page_cost, 0) >= 0 AND COALESCE(color_page_cost, 0) >= 0 AND
        COALESCE(service_contract_cost, 0) >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("device_costs");
}
