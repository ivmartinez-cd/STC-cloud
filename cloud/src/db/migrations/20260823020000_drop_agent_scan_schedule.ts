import type { Knex } from "knex";

/**
 * `agents.scan_schedule` es código muerto desde el 27/05/2026 (`6298b9e`,
 * "replace unified scan with three HP SDS-aligned monitoring loops") — ese
 * commit reemplazó el scheduler custom (días/horas) por el modelo de 3 loops
 * con horario laboral configurable (`agents.business_hours`, migración
 * `20260823010000`) y limpió agente/portal por completo, pero nunca tocó
 * esta columna del backend. Nada la interpreta hoy — el heartbeat la manda
 * en el payload y el agente la ignora en silencio (`RemoteConfigPayload` ni
 * declara el campo). Se elimina en vez de reimplementarla porque no hay
 * ningún spec vigente que pida que un scheduler tipo cron conviva con el
 * horario laboral recién cerrado.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "scan_schedule");
  if (hasColumn) {
    await knex.schema.alterTable("agents", (t) => {
      t.dropColumn("scan_schedule");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("agents", "scan_schedule");
  if (!hasColumn) {
    await knex.schema.alterTable("agents", (t) => {
      t.jsonb("scan_schedule").nullable();
    });
  }
}
