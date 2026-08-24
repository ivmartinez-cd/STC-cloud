import type { Knex } from "knex";

/**
 * Fase 6.3 del bloque de seguridad: 2FA OBLIGATORIO por usuario, gestionado
 * por el admin (checkbox "Exigir 2FA" al crear/editar operadores). Con
 * `totp_required=true` y 2FA sin enrolar, la sesión solo puede acceder a
 * las rutas de enrolamiento (/portal/2fa/*, /me, /logout) — enforcement
 * server-side en `authMiddleware`, no solo un aviso de UI. Default false:
 * cero cambio de comportamiento al desplegar.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("users", "totp_required");
  if (has) return;
  await knex.schema.alterTable("users", (t) => {
    t.boolean("totp_required").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("users", "totp_required");
  if (!has) return;
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("totp_required");
  });
}
