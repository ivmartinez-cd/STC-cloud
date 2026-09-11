import type { Knex } from "knex";

/**
 * Intervalos de los 4 loops de monitoreo (Alert/Identity/Meter/Consumables),
 * personalizables por agente — pedido explícito de Ivan tras comparar la app
 * contra el White Paper "Monitoring Loops" de HP SDS Manager (11/09/2026):
 * hoy hardcodeados en `agent/src/core/MonitorIntervals.ts`
 * (`DEFAULT_MONITOR_INTERVALS`). Misma forma que `agents.business_hours`
 * (migración `20260823010000`): una columna `jsonb` nullable, `null` = "usa
 * el default hardcodeado de hoy", cero cambio de comportamiento para agentes
 * existentes sin configurar.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "monitor_intervals");
  if (!hasColumn) {
    await knex.schema.alterTable("agents", (t) => {
      t.jsonb("monitor_intervals").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "monitor_intervals");
  if (hasColumn) {
    await knex.schema.alterTable("agents", (t) => {
      t.dropColumn("monitor_intervals");
    });
  }
}
