import type { Knex } from "knex";

/**
 * Progreso del barrido de discovery REAL del agente (11/09/2026). El agente
 * pasó a recorrer sus rangos de forma continua por chunks con cursor, así que
 * "cuánto falta de la vuelta en curso" es estado que sólo él conoce: lo manda
 * en cada heartbeat dentro de `system_info.discovery_state` y acá queda la
 * última foto. Una sola columna `jsonb` nullable (mismo criterio que
 * `business_hours`/`snmp_credentials`): `NULL` = agente que todavía no
 * actualizó y nunca lo reportó, no "barrido en cero".
 *
 * Forma del objeto (contrato con el agente):
 *   { in_progress, scanned, total, lap_started_at, last_lap_at, last_lap_ms,
 *     laps_completed }
 *
 * OJO: NO confundir con el "último barrido" que ya muestra el portal
 * (`AgentStats.last_sweep_at`, derivado de un comando `RESCAN`/`FORCE_SCAN`
 * completado en `agent_commands`). Ese es un rescan MANUAL disparado desde el
 * portal; éste es el barrido automático permanente del agente. Conviven, y son
 * dos cosas distintas.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "discovery_state");
  if (hasColumn) return;
  await knex.schema.alterTable("agents", (t) => {
    t.jsonb("discovery_state").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "discovery_state");
  if (!hasColumn) return;
  await knex.schema.alterTable("agents", (t) => {
    t.dropColumn("discovery_state");
  });
}
