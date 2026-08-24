import type { Knex } from "knex";

/**
 * Fase 7 del gap analysis vs HP SDS — cola de registro de dispositivos
 * ("Registro de activos / Dispositivos pendientes de registro" en HP SDS
 * Manager, vi 1.913 pendientes ahí, incluso impresoras Zebra no-HP).
 *
 * Decisiones (ver el plan, sección Fase 7):
 * - Flag en `devices` (`registration_state`), NO una tabla `pending_devices`
 *   aparte: una tabla aparte duplicaría la escalera de identidad completa
 *   (`deviceIdentity.ts`, advisory lock, denylist de seriales, guarda
 *   anti-fusión por MAC) y arriesgaría crear un duplicado en el momento
 *   exacto de "promover" una fila pendiente a registrada.
 * - Las lecturas de un equipo `pending` SE GUARDAN (perder datos en
 *   silencio es la falla más cara ya documentada, R1 del gap analysis) —
 *   sólo `ignored` corta la ingesta (decisión humana explícita).
 * - Opt-in por cliente (`clients.device_approval_required`, default
 *   `false`): mismo criterio que `business_hours`/`remote_ews_enabled` —
 *   ningún cliente existente cambia de comportamiento sin que un operador
 *   lo prenda a propósito.
 * - NO se toca `resolveDeviceIdentity` (sigue filtrando sólo por
 *   `merged_into IS NULL` — indispensable, si no cada sync crearía una fila
 *   pendiente nueva) ni `devices_client_serial_uniq` (un equipo pendiente
 *   compite por unicidad de serial igual que cualquiera).
 */
export async function up(knex: Knex): Promise<void> {
  const hasApprovalFlag = await knex.schema.hasColumn("clients", "device_approval_required");
  if (!hasApprovalFlag) {
    await knex.schema.alterTable("clients", (t) => {
      t.boolean("device_approval_required").notNullable().defaultTo(false);
    });
  }

  const hasRegistrationState = await knex.schema.hasColumn("devices", "registration_state");
  if (!hasRegistrationState) {
    await knex.schema.alterTable("devices", (t) => {
      t.string("registration_state", 20).notNullable().defaultTo("registered");
      t.timestamp("registered_at", { useTz: true }).nullable();
      t.uuid("registered_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.timestamp("ignored_at", { useTz: true }).nullable();
      t.uuid("ignored_by").nullable().references("id").inTable("users").onDelete("SET NULL");
      t.text("ignore_reason").nullable();
    });
    await knex.raw(`
      ALTER TABLE devices ADD CONSTRAINT devices_registration_state_check
        CHECK (registration_state IN ('pending','registered','ignored'))
    `);
    await knex.raw(`
      ALTER TABLE devices ADD CONSTRAINT devices_registration_coherent_check
        CHECK ((registration_state = 'ignored') = (ignored_at IS NOT NULL))
    `);
    // Re-backfill defensivo (mismo paso 0 que 20260822040000): por si esta
    // migración corre en una base con filas ya existentes de un estado
    // intermedio (no debería pasar con el DEFAULT de arriba, pero es gratis).
    await knex.raw(`UPDATE devices SET registration_state = 'registered' WHERE registration_state IS NULL`);
    await knex.raw(`
      CREATE INDEX devices_pending_idx ON devices (client_id, created_at DESC)
        WHERE registration_state = 'pending'
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS devices_pending_idx`);
  const hasRegistrationState = await knex.schema.hasColumn("devices", "registration_state");
  if (hasRegistrationState) {
    await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_registration_coherent_check`);
    await knex.raw(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_registration_state_check`);
    await knex.schema.alterTable("devices", (t) => {
      t.dropColumn("ignore_reason");
      t.dropColumn("ignored_by");
      t.dropColumn("ignored_at");
      t.dropColumn("registered_by");
      t.dropColumn("registered_at");
      t.dropColumn("registration_state");
    });
  }
  const hasApprovalFlag = await knex.schema.hasColumn("clients", "device_approval_required");
  if (hasApprovalFlag) {
    await knex.schema.alterTable("clients", (t) => {
      t.dropColumn("device_approval_required");
    });
  }
}
