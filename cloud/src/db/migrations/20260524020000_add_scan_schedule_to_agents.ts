import type { Knex } from "knex";

/**
 * Scheduler custom de días/horas (`{mode, interval_minutes, custom_days,
 * custom_times}`) — código muerto de punta a punta hoy (nada lo lee ni en
 * el agente ni en el portal, ver gap analysis §2.1). NO confundir con
 * `agents.business_hours` (migración `20260823010000`): esa es horario
 * laboral + TZ real (usada por `BusinessHours.ts` para decidir frecuencia de
 * escaneo), un mecanismo distinto que coincide en forma superficial
 * (ambos tienen un campo de "días") por casualidad, no por diseño compartido.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.jsonb("scan_schedule").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("scan_schedule");
  });
}
