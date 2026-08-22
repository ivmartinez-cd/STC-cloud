import type { Knex } from "knex";

/**
 * Fase C (contract) de "identidad de dispositivo por cliente" (§2.4). Corre
 * después de la Fase B (dedupe) y de que el código ya escriba `client_id` en
 * todo insert de `devices` — en este punto no debería quedar ninguna fila con
 * `client_id NULL`.
 *
 * Además agrega el trigger que mantiene `devices.client_id` sincronizado si un
 * agente cambia de cliente: hoy NO existe ningún endpoint que mueva un agente
 * de cliente (`createAgent` lo fija al crear, `updateConfigSchema` no incluye
 * `clientId`, `activateAgent` no lo toca) — el único camino real es un
 * `UPDATE agents SET client_id` a mano por psql, precisamente el que ningún
 * código de aplicación puede interceptar.
 */
export async function up(knex: Knex): Promise<void> {
  const { rows: [n] } = await knex.raw(`SELECT count(*)::int AS c FROM devices WHERE client_id IS NULL`);
  if (n.c > 0) {
    // Deliberadamente SÍ se aborta acá (a diferencia de la Fase B): esta
    // migración corre cuando ya se espera que todo esté verde, y es trivial
    // de diagnosticar/revertir sin arriesgar la ingesta en curso.
    throw new Error(
      `[MIGRATION] ${n.c} dispositivo(s) con client_id NULL — resolver antes de aplicar NOT NULL`
    );
  }
  await knex.raw(`ALTER TABLE devices ALTER COLUMN client_id SET NOT NULL`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION sync_devices_client_id() RETURNS trigger AS $$
    BEGIN
      UPDATE devices SET client_id = NEW.client_id WHERE agent_id = NEW.id;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.raw(`DROP TRIGGER IF EXISTS agents_client_id_sync ON agents`);
  await knex.raw(`
    CREATE TRIGGER agents_client_id_sync AFTER UPDATE OF client_id ON agents
      FOR EACH ROW WHEN (OLD.client_id IS DISTINCT FROM NEW.client_id)
      EXECUTE FUNCTION sync_devices_client_id()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS agents_client_id_sync ON agents`);
  await knex.raw(`DROP FUNCTION IF EXISTS sync_devices_client_id()`);
  await knex.raw(`ALTER TABLE devices ALTER COLUMN client_id DROP NOT NULL`);
}
