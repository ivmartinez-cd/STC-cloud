import type { Knex } from "knex";

/**
 * "Configuración del sistema" (handoff hifi #3, 26/08/2026, fase 2) — hasta acá
 * el SMTP se leía SÓLO de env (`SMTP_HOST`/`PORT`/`USER`/`PASSWORD`/`FROM`,
 * `services/notificationService/mailer.ts`) y los umbrales de consumible eran
 * consts hardcodeadas (`CRITICAL_PCT`/`LOW_PCT` en `services/suppliesService/
 * queries.ts`). Se agregan a la tabla singleton `system_settings` para que el
 * admin los pueda cambiar sin redeploy.
 *
 * `smtp_password_encrypted`: NUNCA se guarda en texto plano — pasa por
 * `services/cryptoService.ts::encryptSecret(pw, "smtp")` antes del INSERT/UPDATE
 * (mismo mecanismo AES-256-GCM que SNMP/SFTP, purpose distinto). Si `SMTP_HOST`
 * sigue vacío acá, el mailer cae a las env vars — no rompe despliegues existentes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("system_settings", (t) => {
    t.string("smtp_host", 255).nullable();
    t.integer("smtp_port").nullable();
    t.string("smtp_user", 255).nullable();
    t.text("smtp_password_encrypted").nullable();
    t.string("smtp_from", 255).nullable();
    t.string("smtp_encryption", 20).notNullable().defaultTo("starttls");
    t.integer("supply_threshold_warning_pct").notNullable().defaultTo(20);
    t.integer("supply_threshold_critical_pct").notNullable().defaultTo(8);
    t.boolean("supply_manual_review_required").notNullable().defaultTo(false);
  });

  await knex.raw(`
    ALTER TABLE system_settings
      ADD CONSTRAINT system_settings_smtp_encryption_check
        CHECK (smtp_encryption IN ('none', 'starttls', 'tls')),
      ADD CONSTRAINT system_settings_smtp_port_range_check
        CHECK (smtp_port IS NULL OR smtp_port BETWEEN 1 AND 65535),
      ADD CONSTRAINT system_settings_supply_warning_range_check
        CHECK (supply_threshold_warning_pct BETWEEN 1 AND 99),
      ADD CONSTRAINT system_settings_supply_critical_range_check
        CHECK (supply_threshold_critical_pct BETWEEN 1 AND 99)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE system_settings
      DROP CONSTRAINT IF EXISTS system_settings_smtp_encryption_check,
      DROP CONSTRAINT IF EXISTS system_settings_smtp_port_range_check,
      DROP CONSTRAINT IF EXISTS system_settings_supply_warning_range_check,
      DROP CONSTRAINT IF EXISTS system_settings_supply_critical_range_check
  `);
  await knex.schema.alterTable("system_settings", (t) => {
    t.dropColumn("smtp_host");
    t.dropColumn("smtp_port");
    t.dropColumn("smtp_user");
    t.dropColumn("smtp_password_encrypted");
    t.dropColumn("smtp_from");
    t.dropColumn("smtp_encryption");
    t.dropColumn("supply_threshold_warning_pct");
    t.dropColumn("supply_threshold_critical_pct");
    t.dropColumn("supply_manual_review_required");
  });
}
