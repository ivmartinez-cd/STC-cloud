import type { Knex } from "knex";

/**
 * Horario laboral + TZ configurable por agente (§2.1/§3 R7 gap analysis:
 * hoy hardcodeado 08-18 L-V America/Argentina/Buenos_Aires en
 * `agent/src/core/BusinessHours.ts`). Una sola columna `jsonb` nullable —
 * `null` significa "usa el default hardcodeado de hoy" (ver
 * `services/businessHours.ts::DEFAULT_BUSINESS_HOURS`), cero cambio de
 * comportamiento para agentes existentes sin configurar.
 *
 * OJO: NO confundir con `agents.scan_schedule` (migración `20260524020000`,
 * también jsonb, también con un campo de "días") — ese es un scheduler
 * custom de días/horas totalmente muerto (nada lo lee ni en el agente ni en
 * el portal) y sin TZ propia. Son dos mecanismos distintos que coinciden en
 * forma superficial por casualidad, no por diseño compartido.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "business_hours");
  if (!hasColumn) {
    await knex.schema.alterTable("agents", (t) => {
      t.jsonb("business_hours").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "business_hours");
  if (hasColumn) {
    await knex.schema.alterTable("agents", (t) => {
      t.dropColumn("business_hours");
    });
  }
}
