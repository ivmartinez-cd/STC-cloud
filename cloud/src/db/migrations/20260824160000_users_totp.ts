import type { Knex } from "knex";

/**
 * 2FA TOTP opt-in para usuarios del portal (bloque de seguridad post gap
 * analysis — el SDS lo ofrece como "Utilizar la autenticación de dos
 * factores" en Preferencias; acá estaba anotado en los parciales de la
 * Fase 4 y ligado al riesgo R5).
 *
 * `totp_secret` guarda el secreto CIFRADO con `cryptoService.encryptSecret`
 * (mismo mecanismo que las credenciales SNMP) — nunca en claro. Un secreto
 * con `totp_enabled=false` es un enrolamiento pendiente (el usuario generó
 * el QR pero todavía no confirmó con un código); el login solo exige TOTP
 * cuando `totp_enabled=true`.
 */
export async function up(knex: Knex): Promise<void> {
  const hasSecret = await knex.schema.hasColumn("users", "totp_secret");
  if (hasSecret) return;
  await knex.schema.alterTable("users", (t) => {
    t.text("totp_secret").nullable();
    t.boolean("totp_enabled").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasSecret = await knex.schema.hasColumn("users", "totp_secret");
  if (!hasSecret) return;
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("totp_secret");
    t.dropColumn("totp_enabled");
  });
}
